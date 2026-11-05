package com.manara.agent.enforcers

import com.manara.agent.enforcers.UsageReportDecision.App
import com.manara.agent.enforcers.UsageReportDecision.Last
import com.manara.agent.enforcers.UsageReportDecision.Snapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageReportDecisionTest {
    private val hour = UsageReportDecision.MIN_GAP_MILLIS

    @Test
    fun snapshotKeepsUsedAppsBusiestFirstAndDropsZeroMinuteApps() {
        val snapshot = UsageReportDecision.snapshot(
            mapOf("idle.app" to 0L, "small.app" to 5L, "big.app" to 50L, "tie.b" to 5L),
            "2026-11-05"
        )
        assertEquals("2026-11-05", snapshot.date)
        assertEquals(60L, snapshot.totalMinutes)
        assertEquals(
            listOf(App("big.app", 50), App("small.app", 5), App("tie.b", 5)),
            snapshot.apps
        )
    }

    @Test
    fun snapshotCapsTheListButNotTheTotal() {
        val many = (1..40).associate { "app.$it" to it.toLong() }
        val snapshot = UsageReportDecision.snapshot(many, "2026-11-05")
        assertEquals(UsageReportDecision.MAX_APPS, snapshot.apps.size)
        assertEquals("app.40", snapshot.apps.first().packageName)
        assertEquals("app.11", snapshot.apps.last().packageName)
        assertEquals(many.values.sum(), snapshot.totalMinutes)
    }

    @Test
    fun noUsageGivesAnEmptySnapshot() {
        assertEquals(Snapshot("2026-11-05", 0, emptyList()), UsageReportDecision.snapshot(emptyMap(), "2026-11-05"))
        assertEquals(0L, UsageReportDecision.snapshot(mapOf("a" to 0L), "2026-11-05").totalMinutes)
    }

    @Test
    fun theFirstReportIsAlwaysSent_evenIfEmpty_soTheParentSeesItWorks() {
        assertTrue(UsageReportDecision.shouldReport(Snapshot("2026-11-05", 0, emptyList()), null, 1_000))
    }

    @Test
    fun nothingIsSentWithinAnHourOfTheLastReport() {
        val last = Last(atMillis = 10 * hour, date = "2026-11-05", totalMinutes = 10)
        val changed = Snapshot("2026-11-05", 99, listOf(App("a", 99)))
        assertFalse(UsageReportDecision.shouldReport(changed, last, 10 * hour))
        assertFalse(UsageReportDecision.shouldReport(changed, last, 11 * hour - 1))
        assertTrue(UsageReportDecision.shouldReport(changed, last, 11 * hour))
    }

    @Test
    fun anUnchangedTotalOnTheSameDayIsNotResent() {
        val last = Last(10 * hour, "2026-11-05", 42)
        val same = Snapshot("2026-11-05", 42, listOf(App("a", 42)))
        assertFalse(UsageReportDecision.shouldReport(same, last, 20 * hour))
    }

    @Test
    fun aNewDayWithUsageIsSentButAnEmptyNewDayIsNot() {
        val last = Last(10 * hour, "2026-11-05", 42)
        assertTrue(UsageReportDecision.shouldReport(Snapshot("2026-11-06", 42, listOf(App("a", 42))), last, 20 * hour))
        assertFalse(UsageReportDecision.shouldReport(Snapshot("2026-11-06", 0, emptyList()), last, 20 * hour))
    }

    @Test
    fun aClockThatMovedBackDoesNotSilenceReportsUntilItCatchesUp() {
        val last = Last(atMillis = 100 * hour, date = "2026-11-05", totalMinutes = 10)
        val changed = Snapshot("2026-11-05", 99, listOf(App("a", 99)))
        assertTrue(UsageReportDecision.shouldReport(changed, last, 50 * hour))
    }
}
