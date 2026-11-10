package com.manara.agent.enforcers

import com.manara.agent.enforcers.PrayerTimes.Prayer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PrayerPauseDecisionTest {

    private val times = mapOf(
        Prayer.FAJR to 323, Prayer.DHUHR to 723, Prayer.ASR to 893,
        Prayer.MAGHRIB to 1034, Prayer.ISHA to 1123
    )
    private val all = Prayer.values().toSet()

    @Test
    fun `the pause starts at the prayer's minute`() {
        assertNull(PrayerPauseDecision.activePause(times, all, 15, 722))
        assertEquals(Prayer.DHUHR, PrayerPauseDecision.activePause(times, all, 15, 723)?.prayer)
    }

    @Test
    fun `the pause ends after its length, the end minute excluded`() {
        assertEquals(738, PrayerPauseDecision.activePause(times, all, 15, 737)?.endMinute)
        assertNull(PrayerPauseDecision.activePause(times, all, 15, 738))
    }

    @Test
    fun `a prayer the parent didn't tick causes no pause`() {
        assertNull(PrayerPauseDecision.activePause(times, setOf(Prayer.MAGHRIB), 15, 725))
    }

    @Test
    fun `a length of zero turns it off`() {
        assertNull(PrayerPauseDecision.activePause(times, all, 0, 723))
    }

    @Test
    fun `a pause that began before midnight still holds just after it`() {
        val late = mapOf(Prayer.ISHA to 1430)
        val pause = PrayerPauseDecision.activePause(late, all, 20, 5)
        assertEquals(Prayer.ISHA, pause?.prayer)
        assertEquals(10, pause?.endMinute)
        assertNull(PrayerPauseDecision.activePause(late, all, 20, 10))
    }

    @Test
    fun `a prayer missing from the day's times is skipped`() {
        assertNull(PrayerPauseDecision.activePause(mapOf(Prayer.DHUHR to 766), all, 15, 323))
    }

    @Test
    fun `next pause is the next ticked prayer, and none after the last`() {
        assertEquals(Prayer.ASR to 893, PrayerPauseDecision.nextPause(times, all, 723))
        assertEquals(Prayer.MAGHRIB to 1034, PrayerPauseDecision.nextPause(times, setOf(Prayer.FAJR, Prayer.MAGHRIB), 400))
        assertNull(PrayerPauseDecision.nextPause(times, all, 1123))
    }
}
