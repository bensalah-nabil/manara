package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Log
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.Calendar
import java.util.UUID

/**
 * The lock schedule (bedtime, school hours) and the parent's "Lock now".
 *
 * Inside a scheduled window, apps are paused through [AppPauses] ([BedtimeDecision]): calls, texts,
 * the clock, Settings, Manara and the parent's allowed apps stay usable, so a child can always reach
 * a parent (roadmap P2).
 * "Lock now" still calls `DevicePolicyManager.lockNow`. The window decision lives in
 * [LockDecision] (pure, unit-tested); this is the thin Android wrapper, plus once-per-window
 * event reporting, persisted across instance recreation, the same lesson `TimeLimitEnforcer`
 * already paid for on a real device.
 */
class LockEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "lock"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val pauses = AppPauses(context)
    private val health = HealthTracker(context, prefs, id)

    private var schedule: Policy.LockSchedule? = null
    private var wasLocked: Boolean
        get() = prefs.getBoolean(KEY_WAS_LOCKED, false)
        set(value) = prefs.edit().putBoolean(KEY_WAS_LOCKED, value).apply()

    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        schedule = policy.lockSchedule
        enforceNow()
    }

    /**
     * Re-checks the schedule against the current time. Called from
     * [apply], and must also run on every periodic sync regardless of
     * whether the policy itself changed — a schedule is wall-clock-driven,
     * not event-driven (see `SyncWorker`'s unconditional re-apply).
     */
    fun enforceNow() {
        val active = schedule?.takeIf { it.enabled }
        val windows = active?.windows ?: emptyList()
        val calendar = Calendar.getInstance()
        val day = calendar.get(Calendar.DAY_OF_WEEK)
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        val isLocked = LockDecision.isWithinAnyWindow(windows, day, hour)

        // Outside a window the rule holds nothing, so the end of bedtime reopens what it paused
        // (unless another rule still holds it, ADR-0009). The app lists are looked up only inside.
        val toHold = if (isLocked) {
            BedtimeDecision.appsToHold(windows, day, hour, launchableApps(), keptOpen(), active?.allowedApps.orEmpty().toSet())
        } else {
            emptySet()
        }
        val outcome = pauses.hold(BedtimeDecision.RULE, toHold)
        when {
            // Pausing failed outright (Manara not device owner, say): one report per change.
            toHold.isNotEmpty() -> health.observe(CHECK_BEDTIME_PAUSE, outcome.pauseError == null)
            windows.isEmpty() -> health.forget(CHECK_BEDTIME_PAUSE)
        }
        // Essential apps Android won't pause (the home app, say) are expected, not a problem.
        if (outcome.refusedPause.isNotEmpty()) Log.i(TAG, "bedtime: Android kept open ${outcome.refusedPause}")

        if (isLocked && !wasLocked) pendingEvents.add(lockEvent())
        wasLocked = isLocked
    }

    /** Every app with a launcher icon; the manifest's `<queries>` makes them visible. */
    private fun launchableApps(): Set<String> =
        context.packageManager
            .queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
            .map { it.activityInfo.packageName }
            .toSet()

    /**
     * What a child always keeps at bedtime: calls (the default phone app), texts (the default SMS
     * app, so a parent's text shows), alarms, Settings and Manara.
     */
    private fun keptOpen(): Set<String> = buildSet {
        add(context.packageName)
        context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage?.let(::add)
        Telephony.Sms.getDefaultSmsPackage(context)?.let(::add)
        listOf(
            Intent(AlarmClock.ACTION_SHOW_ALARMS),
            Intent(AlarmClock.ACTION_SET_ALARM),
            Intent(Settings.ACTION_SETTINGS),
        ).forEach { intent ->
            context.packageManager.queryIntentActivities(intent, 0).forEach { add(it.activityInfo.packageName) }
        }
    }

    /**
     * For an explicit `lock_now` command from the backend, independent of
     * any schedule. Lets `lockNow()` throw rather than swallowing it --
     * found on a real device that a silent `runCatching` here meant
     * `SyncManager` reported "acked" for a `lock_now` that had actually
     * failed, with zero signal anywhere that anything was wrong.
     */
    fun lockImmediately() {
        devicePolicyManager.lockNow()
        pendingEvents.add(lockEvent())
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    private fun lockEvent(): Event = Event(
        id = UUID.randomUUID().toString(),
        kind = EventKind.lock,
        occurredAt = Instant.now().toString(),
        payload = JsonObject(emptyMap())
    )

    companion object {
        private const val TAG = "ManaraLockEnforcer"
        private const val PREFS_NAME = "lock_enforcer"
        private const val KEY_WAS_LOCKED = "was_locked"
        /** The console names it (controller/src/protection.ts, DETAILS). */
        const val CHECK_BEDTIME_PAUSE = "bedtime_pause"
    }
}
