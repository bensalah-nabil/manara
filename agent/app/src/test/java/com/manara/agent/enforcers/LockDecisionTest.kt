package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import java.util.Calendar
import org.junit.Test

class LockDecisionTest {

    private val weekdayBedtime = Policy.LockSchedule.Window(
        days = listOf(
            Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY,
            Calendar.THURSDAY, Calendar.FRIDAY
        ),
        fromHour = 22,
        toHour = 7
    )

    @Test
    fun `same-day window, inside hours`() {
        val window = Policy.LockSchedule.Window(days = listOf(Calendar.SATURDAY), fromHour = 13, toHour = 15)
        assertTrue(LockDecision.isWithinAnyWindow(listOf(window), Calendar.SATURDAY, 14))
    }

    @Test
    fun `same-day window, outside hours`() {
        val window = Policy.LockSchedule.Window(days = listOf(Calendar.SATURDAY), fromHour = 13, toHour = 15)
        assertFalse(LockDecision.isWithinAnyWindow(listOf(window), Calendar.SATURDAY, 16))
    }

    @Test
    fun `midnight-crossing window, late at night on a listed day`() {
        // Monday 23:00 -- Monday is listed, hour is past fromHour.
        assertTrue(LockDecision.isWithinAnyWindow(listOf(weekdayBedtime), Calendar.MONDAY, 23))
    }

    @Test
    fun `midnight-crossing window, early morning after a listed day`() {
        // Tuesday 03:00 -- the window that STARTED Monday night is still
        // active; Monday (not Tuesday) is what must be in the days list.
        assertTrue(LockDecision.isWithinAnyWindow(listOf(weekdayBedtime), Calendar.TUESDAY, 3))
    }

    @Test
    fun `midnight-crossing window, early morning after a day NOT listed`() {
        // Saturday 03:00 -- Friday night's window would have ended by 07:00
        // Saturday only if Friday is listed (it is), so this specific case
        // is actually still inside the window; use Sunday 03:00 instead,
        // where Saturday (not listed) would be the "previous day".
        assertFalse(LockDecision.isWithinAnyWindow(listOf(weekdayBedtime), Calendar.SUNDAY, 3))
    }

    @Test
    fun `midnight-crossing window, daytime is never locked`() {
        assertFalse(LockDecision.isWithinAnyWindow(listOf(weekdayBedtime), Calendar.MONDAY, 12))
    }

    @Test
    fun `no windows means never locked`() {
        assertFalse(LockDecision.isWithinAnyWindow(emptyList(), Calendar.MONDAY, 23))
    }
}
