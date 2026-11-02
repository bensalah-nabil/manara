package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.Context
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.Calendar
import java.util.UUID

/**
 * architecture.md §2.2: `DevicePolicyManager.lockNow`. The "is now inside a
 * scheduled lock window" decision lives in [LockDecision] (pure,
 * unit-tested); this is the thin Android wrapper, plus once-per-window
 * event reporting — persisted across instance recreation, the same lesson
 * `TimeLimitEnforcer` already paid for on a real device.
 */
class LockEnforcer(context: Context) : PolicyEnforcer {
    override val id = "lock"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

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
        val windows = schedule?.takeIf { it.enabled }?.windows ?: emptyList()
        val calendar = Calendar.getInstance()
        val isLocked = LockDecision.isWithinAnyWindow(
            windows, calendar.get(Calendar.DAY_OF_WEEK), calendar.get(Calendar.HOUR_OF_DAY)
        )

        if (isLocked) {
            runCatching { devicePolicyManager.lockNow() }
            if (!wasLocked) pendingEvents.add(lockEvent())
        }
        wasLocked = isLocked
    }

    /** For an explicit `lock_now` command from the backend, independent of any schedule. */
    fun lockImmediately() {
        runCatching { devicePolicyManager.lockNow() }
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
        private const val PREFS_NAME = "lock_enforcer"
        private const val KEY_WAS_LOCKED = "was_locked"
    }
}
