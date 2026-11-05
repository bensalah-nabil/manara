package com.manara.agent.policy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CollectionStatusSummaryTest {
    private val now = 1_800_000_000_000L
    private val enabled = Policy(
        version = 14,
        location = Policy.Location(enabled = true),
        timeLimits = Policy.TimeLimits(true, listOf(Policy.TimeLimits.Rule("social", listOf("sample.app"), 60)))
    )
    private val historical = CollectionStatusSummary.LocationStatus(
        toggleOn = true, permissionGranted = true, historyKnown = true,
        lastSample = CollectionStatusSummary.SavedSample(now - 60_000, now - 1_000)
    )

    @Test
    fun locationOnlyPolicyStillRefreshes() {
        assertTrue(CollectionStatusSummary.needsRefresh(Policy(14, location = Policy.Location(true))))
        assertTrue(CollectionStatusSummary.needsRefresh(enabled.copy(location = Policy.Location(false))))
        assertFalse(CollectionStatusSummary.needsRefresh(Policy(14)))
        assertFalse(CollectionStatusSummary.needsRefresh(null))
    }

    @Test
    fun usageReportAloneCountsAsNeedingUsageData() {
        val reportOnly = Policy(14, usageReport = Policy.UsageReport(true))
        assertTrue(CollectionStatusSummary.needsRefresh(reportOnly))
        assertTrue(CollectionStatusSummary.usageDataNeeded(reportOnly))
        assertFalse(CollectionStatusSummary.usageDataNeeded(Policy(14, usageReport = Policy.UsageReport(false))))
        assertFalse(CollectionStatusSummary.usageDataNeeded(null))
        val unreadable = CollectionStatusSummary.describe(reportOnly, CollectionStatusSummary.Usage.ACCESS_MISSING, now = now)
        assertTrue(unreadable.contains("Usage data: unavailable (Usage Access missing)"))
        assertTrue(CollectionStatusSummary.describe(reportOnly, CollectionStatusSummary.Usage.READABLE, now = now).contains("Usage data: readable"))
    }

    @Test
    fun noPolicyAndDisabledPolicyDoNotClaimCollection() {
        assertTrue(CollectionStatusSummary.describe(null).contains("Location: unknown (no policy)"))
        val summary = CollectionStatusSummary.describe(Policy(14), location = historical, now = now)
        assertTrue(summary.contains("Usage data: inactive"))
        assertTrue(summary.contains("Location: off by policy"))
        assertFalse(summary.contains("Historical location sample"))
    }

    @Test
    fun prerequisitesDoNotProveCollection() {
        val summary = CollectionStatusSummary.describe(enabled,
            location = historical.copy(lastSample = null), now = now)
        assertTrue(summary.contains("Location: prerequisites available"))
        assertTrue(summary.contains("No saved location sample recorded locally"))
        assertFalse(summary.contains("collecting"))
        assertFalse(summary.contains("uploaded"))
    }

    @Test
    fun blockersTakePrecedenceOverHistoricalSuccess() {
        val toggle = CollectionStatusSummary.describe(enabled, location = historical.copy(toggleOn = false), now = now)
        assertTrue(toggle.contains("Location: device setting off"))
        assertTrue(toggle.contains("Historical location sample"))
        val permission = CollectionStatusSummary.describe(enabled,
            location = historical.copy(permissionGranted = false), now = now)
        assertTrue(permission.contains("Location: permission missing"))
        assertFalse(permission.contains("Location: prerequisites available"))
    }

    @Test
    fun unknownPrerequisitesAndHistoryStayUnknown() {
        val summary = CollectionStatusSummary.describe(enabled)
        assertTrue(summary.contains("Location: prerequisites unknown"))
        assertTrue(summary.contains("Saved location history: unavailable"))
        assertTrue(summary.contains("Usage data: unavailable"))
    }

    @Test
    fun sampleTimeIsDistinctFromSaveTimeAndInvalidTimesStayUnknown() {
        val summary = CollectionStatusSummary.describe(enabled, location = historical, now = now)
        assertTrue(summary.contains("Saved locally: ${java.time.Instant.ofEpochMilli(now - 1_000)}"))
        assertTrue(summary.contains("Sample time: ${java.time.Instant.ofEpochMilli(now - 60_000)}"))
        val invalid = CollectionStatusSummary.describe(enabled, location = historical.copy(
            lastSample = CollectionStatusSummary.SavedSample(0L, now + 1_000)), now = now)
        assertTrue(invalid.contains("Saved locally: unknown (clock inconsistency)"))
        assertTrue(invalid.contains("Sample time: unknown"))
    }

    @Test
    fun usageReadAndAccessAreDistinctAndCallLogsStayUnsupported() {
        assertTrue(CollectionStatusSummary.describe(enabled, CollectionStatusSummary.Usage.READABLE)
            .contains("Usage data: readable"))
        assertTrue(CollectionStatusSummary.describe(enabled, CollectionStatusSummary.Usage.ACCESS_MISSING)
            .contains("Usage data: unavailable (Usage Access missing)"))
        assertTrue(CollectionStatusSummary.describe(enabled.copy(callLog = Policy.CallLog(true)))
            .contains("Call logs: unsupported"))
    }
}
