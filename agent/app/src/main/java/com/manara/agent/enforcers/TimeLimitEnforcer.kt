package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.Calendar
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
 * `queryUsageStats` returns nothing and this enforcer does nothing — fails
 * closed, but this is a real one-time setup step to document, not to gloss
 * over the way `POST_NOTIFICATIONS` almost was.
 */
class TimeLimitEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "time-limit"

    private val usageStatsManager =
        context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private val devicePolicyManager =
        context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)

    private var currentRules: List<Policy.TimeLimits.Rule> = emptyList()
    private var overLimitState: Map<String, Boolean> = emptyMap()
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        currentRules = if (policy.timeLimits.enabled) policy.timeLimits.rules else emptyList()
        enforceNow()
    }

    /**
     * Re-checks usage against the current rules. Called from [apply], and
     * should also be called periodically (Phase 1 step 5's `WorkManager`
     * job — not yet built) since usage changes continuously, not just when
     * the policy itself changes.
     */
    fun enforceNow() {
        val decision = TimeLimitDecision.decide(
            rules = currentRules,
            usageMinutesByPackage = todaysUsageMinutesByPackage(),
            previousOverLimitState = overLimitState
        )
        overLimitState = decision.newOverLimitState

        if (decision.toSuspend.isNotEmpty()) {
            runCatching {
                devicePolicyManager.setPackagesSuspended(admin, decision.toSuspend.toTypedArray(), true)
            }
        }
        if (decision.toResume.isNotEmpty()) {
            runCatching {
                devicePolicyManager.setPackagesSuspended(admin, decision.toResume.toTypedArray(), false)
            }
        }
        decision.justCrossedRules.forEach { pendingEvents.add(limitHitEvent(it)) }
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    private fun todaysUsageMinutesByPackage(): Map<String, Long> {
        val startOfDay = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        // Returns an empty list (not null, not a throw) if Usage Access hasn't
        // been granted yet -- the "fails closed" behavior this class relies on.
        val stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY, startOfDay, System.currentTimeMillis()
        )
        return stats.orEmpty().associate { it.packageName to it.totalTimeInForeground / 60_000 }
    }

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
}
