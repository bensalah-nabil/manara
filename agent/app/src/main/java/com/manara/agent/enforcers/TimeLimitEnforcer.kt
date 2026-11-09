package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.events.enforcementEvent
import com.manara.agent.policy.Policy
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * architecture.md §2.2: `UsageStatsManager` + `setPackagesSuspended`. The
 * actual suspend/resume decision lives in [TimeLimitDecision] (pure,
 * unit-tested); this class is just the Android I/O around it.
 *
 * Requires the Usage Access special permission (Settings → Apps → Special
 * access → Usage access), granted manually. Unlike `POST_NOTIFICATIONS` — a
 * runtime permission device owner can self-grant via
 * `setPermissionGrantState` (see `OwnerReceiver`) — `PACKAGE_USAGE_STATS` is
 * AppOps-backed with no device-owner silent-grant API. Without it,
 * usage observations are unavailable, so positive time budgets cannot be
 * measured. The health event reports that loss, and what was blocked stays
 * blocked ([TimeLimitDecision.holdWithoutUsage]).
 */
class TimeLimitEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "time-limit"

    private val dailyUsage = DailyUsageReader(context)
    private val devicePolicyManager =
        context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private var currentRules: List<Policy.TimeLimits.Rule> = emptyList()

    /**
     * Persisted, not in-memory — found the hard way: a *second* instance of
     * this class (e.g. the app reopened between taps on the Phase 1 test
     * harness, or any process restart) used to start with this at empty,
     * silently forgetting what was actually suspended and making "resume"
     * a permanent no-op even after the TimeLimitDecision logic was fixed.
     * Read fresh from SharedPreferences on every [enforceNow] call instead
     * of trusted as in-memory state.
     */
    private var overLimitState: Map<String, Boolean>
        get() = prefs.getString(KEY_OVER_LIMIT, null)
            ?.let { runCatching { json.decodeFromString<Map<String, Boolean>>(it) }.getOrNull() }
            ?: emptyMap()
        set(value) = prefs.edit().putString(KEY_OVER_LIMIT, json.encodeToString(value)).apply()

    private var suspendedPackages: Set<String>
        get() = prefs.getStringSet(KEY_SUSPENDED, emptySet()).orEmpty()
        set(value) = prefs.edit().putStringSet(KEY_SUSPENDED, value).apply()

    private val pendingEvents = mutableListOf<Event>()
    private val health = HealthTracker(context, prefs, id)

    override fun apply(policy: Policy) {
        currentRules = if (policy.timeLimits.enabled) withInstalledGames(policy.timeLimits.rules) else emptyList()
        enforceNow()
    }

    /**
    * Re-checks usage against the current rules. Called from [apply],
    * including the periodic SyncWorker's cached-policy application.
     */
    fun enforceNow() {
        if (currentRules.isEmpty()) {
            health.forget(CHECK_USAGE_ACCESS)
        } else {
            // Without Usage Access every limit silently never triggers -- the most likely bypass.
            health.observe(CHECK_USAGE_ACCESS, dailyUsage.hasAccess())
        }
        val usage = dailyUsage.readMinutes()
        val decision = if (usage == null) {
            TimeLimitDecision.holdWithoutUsage(currentRules, overLimitState, suspendedPackages)
        } else {
            TimeLimitDecision.decide(
                rules = currentRules,
                usageMinutesByPackage = usage,
                previousOverLimitState = overLimitState,
                previouslySuspendedPackages = suspendedPackages
            )
        }
        overLimitState = decision.newOverLimitState
        suspendedPackages = decision.newSuspendedPackages

        // A rule may list apps this phone doesn't have (TikTok Lite, say): Android would refuse those.
        val toSuspend = decision.toSuspend.filter(::isInstalled)
        val toResume = decision.toResume.filter(::isInstalled)
        if (toSuspend.isNotEmpty()) {
            runCatching {
                devicePolicyManager.setPackagesSuspended(admin, toSuspend.toTypedArray(), true)
            }.onSuccess { refused ->
                reportRefused("suspend", refused)
            }.onFailure {
                Log.w(TAG, "setPackagesSuspended(true) threw", it)
                pendingEvents.add(enforcementEvent(id, "failed", "suspend: ${it.javaClass.simpleName}"))
            }
        }
        if (toResume.isNotEmpty()) {
            runCatching {
                devicePolicyManager.setPackagesSuspended(admin, toResume.toTypedArray(), false)
            }.onSuccess { refused ->
                reportRefused("resume", refused)
            }.onFailure {
                Log.w(TAG, "setPackagesSuspended(false) threw", it)
                pendingEvents.add(enforcementEvent(id, "failed", "resume: ${it.javaClass.simpleName}"))
            }
        }
        decision.justCrossedRules.forEach { pendingEvents.add(limitHitEvent(it)) }
    }

    // setPackagesSuspended returns the packages it could NOT change (e.g. system/critical apps).
    // This runs every minute while the screen is on, so the same refusal is reported only once.
    private fun reportRefused(action: String, refused: Array<String>?) {
        val detail = refused?.takeIf { it.isNotEmpty() }?.sorted()?.joinToString().orEmpty()
        val key = "$KEY_LAST_REFUSED$action"
        if (prefs.getString(key, "") == detail) return
        prefs.edit().putString(key, detail).apply()
        if (detail.isEmpty()) return
        Log.w(TAG, "$action refused for $detail")
        pendingEvents.add(enforcementEvent(id, "failed", "$action refused: $detail"))
    }

    // Looked up on each check, so a game installed later is covered within a minute.
    private fun withInstalledGames(rules: List<Policy.TimeLimits.Rule>): List<Policy.TimeLimits.Rule> {
        if (rules.none { it.allGames }) return rules
        val games = context.packageManager.getInstalledApplications(0)
            .filter { it.category == ApplicationInfo.CATEGORY_GAME }
            .map { it.packageName }
        return rules.map { if (it.allGames) it.copy(packages = (it.packages + games).distinct()) else it }
    }

    private fun isInstalled(packageName: String): Boolean =
        runCatching { context.packageManager.getApplicationInfo(packageName, 0) }.isSuccess

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    /** Internal (not private) so the Phase 1 test harness can show the exact
     *  number this class is actually working with, rather than inferring it
     *  from `adb shell dumpsys usagestats`'s not-entirely-legible format. */
    internal fun todaysUsageMinutesByPackage(): Map<String, Long> = dailyUsage.readMinutes().orEmpty()

    private fun limitHitEvent(rule: Policy.TimeLimits.Rule): Event =
        Event(
            id = UUID.randomUUID().toString(),
            kind = EventKind.usage,
            occurredAt = Instant.now().toString(),
            payload = JsonObject(
                mapOf(
                    "category" to JsonPrimitive(rule.category),
                    "dailyMinutes" to JsonPrimitive(rule.dailyMinutes)
                )
            )
        )

    companion object {
        private const val TAG = "ManaraTimeLimit"
        private const val PREFS_NAME = "time_limit_enforcer"
        private const val KEY_SUSPENDED = "suspended_packages"
        private const val KEY_OVER_LIMIT = "over_limit_state"
        private const val KEY_LAST_REFUSED = "last_refused_"
        private const val CHECK_USAGE_ACCESS = "usage_access"
    }
}
