package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import java.util.Calendar

/**
 * Pure "is now inside a lock window" check, separate from [LockEnforcer]'s
 * `DevicePolicyManager.lockNow()` call — same split as `TimeLimitDecision`,
 * so the one genuinely tricky part (bedtime windows crossing midnight) is
 * unit-testable without a device.
 *
 * Day-of-week numbering: `java.util.Calendar`'s own convention
 * (`SUNDAY = 1` .. `SATURDAY = 7`) — the API spec's example
 * (`days: [1,2,3,4,5]`) doesn't pin this down explicitly, so this is a
 * documented choice, not an assumption.
 */
object LockDecision {

    fun isWithinAnyWindow(
        windows: List<Policy.LockSchedule.Window>,
        dayOfWeek: Int,
        hour: Int
    ): Boolean = windows.any { isWithinWindow(it, dayOfWeek, hour) }

    private fun isWithinWindow(window: Policy.LockSchedule.Window, dayOfWeek: Int, hour: Int): Boolean {
        return if (window.fromHour <= window.toHour) {
            // Simple same-day window, e.g. 13:00-15:00.
            dayOfWeek in window.days && hour >= window.fromHour && hour < window.toHour
        } else {
            // Crosses midnight, e.g. 22:00-07:00: active late on a listed
            // day, or early the morning *after* a listed day -- keyed by
            // the day the window started, not the day it's currently.
            (dayOfWeek in window.days && hour >= window.fromHour) ||
                (previousDayOfWeek(dayOfWeek) in window.days && hour < window.toHour)
        }
    }

    private fun previousDayOfWeek(dayOfWeek: Int): Int =
        if (dayOfWeek == Calendar.SUNDAY) Calendar.SATURDAY else dayOfWeek - 1
}
