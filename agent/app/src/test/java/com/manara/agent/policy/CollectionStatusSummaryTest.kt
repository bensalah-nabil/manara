package com.manara.agent.policy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CollectionStatusSummaryTest {
    @Test
    fun usageDataIsReadForAppLimitsThatNameAppsAndForTheUsageReport() {
        val namedApps = Policy(14, timeLimits = Policy.TimeLimits(true, listOf(Policy.TimeLimits.Rule("social", listOf("sample.app"), 60))))
        assertTrue(CollectionStatusSummary.usageDataNeeded(namedApps))
        assertTrue(CollectionStatusSummary.usageDataNeeded(Policy(14, usageReport = Policy.UsageReport(true))))
        assertFalse(CollectionStatusSummary.usageDataNeeded(Policy(14, usageReport = Policy.UsageReport(false))))
        assertFalse("limits switched off", CollectionStatusSummary.usageDataNeeded(namedApps.copy(timeLimits = namedApps.timeLimits.copy(enabled = false))))
        assertFalse(CollectionStatusSummary.usageDataNeeded(Policy(14, location = Policy.Location(true))))
        assertFalse(CollectionStatusSummary.usageDataNeeded(null))
    }
}
