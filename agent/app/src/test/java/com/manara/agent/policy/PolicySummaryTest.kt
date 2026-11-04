package com.manara.agent.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicySummaryTest {
    @Test
    fun unavailableUsageIsDifferentFromNoRecordedUsage() {
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(
            Policy.TimeLimits.Rule("social", listOf("first.app"), 60)
        )))
        assertTrue(PolicySummary.describe(policy).contains("Time left today: unavailable"))
        assertFalse(PolicySummary.describe(policy).contains("60 min (estimated)"))
        assertTrue(PolicySummary.describe(policy, emptyMap()).contains("Time left today: 60 min (estimated)"))
    }

    @Test
    fun sharedAndOverlappingRulesShowTightestRemainingBudget() {
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(
            Policy.TimeLimits.Rule("social", listOf("first.app", "second.app"), 60),
            Policy.TimeLimits.Rule("individual", listOf("first.app"), 31)
        )))
        val summary = PolicySummary.describe(policy, mapOf("first.app" to 30L, "second.app" to 25L))
        assertTrue(summary.contains("Budget shared by 2 apps"))
        assertTrue(summary.contains("first.app\nTime left today: 1 min (estimated)"))
        assertTrue(summary.contains("second.app\nTime left today: 5 min (estimated)"))
    }

    @Test
    fun exhaustedBudgetsNeverShowNegativeTime() {
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(
            Policy.TimeLimits.Rule("social", listOf("first.app"), 1)
        )))
        assertTrue(PolicySummary.describe(policy, mapOf("first.app" to 10L))
            .contains("Time left today: 0 min (estimated)"))
    }

    @Test
    fun disabledRulesDoNotShowRemainingBudgets() {
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(false, listOf(
            Policy.TimeLimits.Rule("social", listOf("first.app"), 60)
        )))
        val summary = PolicySummary.describe(policy, emptyMap())
        assertTrue(summary.contains("Daily app limits\nOff"))
        assertFalse(summary.contains("Time left today:"))
    }

    @Test
    fun absentPolicyDoesNotClaimProtections() {
        assertEquals("No policy received", PolicySummary.describe(null))
    }

    @Test
    fun defaultsShowDisabledAndUnsupportedCapabilities() {
        val summary = PolicySummary.describe(Policy(version = 11))
        assertTrue(summary.contains("Policy version: 11"))
        assertTrue(summary.contains("Daily app limits\nOff"))
        assertTrue(summary.contains("Location collection: off"))
        assertTrue(summary.contains("Call logs: not collected (unsupported)"))
        assertTrue(summary.contains("Requested restrictions\nNone"))
    }

    @Test
    fun requestedCollectionIsNotPresentedAsWorking() {
        val summary = PolicySummary.describe(Policy(
            version = 1,
            siteFilter = Policy.SiteFilter(enabled = true),
            location = Policy.Location(enabled = true, intervalMinutes = 20),
            callLog = Policy.CallLog(enabled = true)
        ))
        assertTrue(summary.contains("Site filtering: requested, DNS host missing"))
        assertTrue(summary.contains("Location collection: requested, every 20 min"))
        assertTrue(summary.contains("Call logs: not collected (unsupported, requested by policy)"))
    }

    @Test
    fun showsZeroMinuteLimitAndOnlyRequestedRestrictions() {
        val summary = PolicySummary.describe(Policy(
            version = 1,
            timeLimits = Policy.TimeLimits(enabled = true, rules = listOf(
                Policy.TimeLimits.Rule("social", listOf("com.facebook.katana"), 0)
            )),
            restrictions = Policy.Restrictions(blockPrivateDnsConfig = true)
        ))
        assertTrue(summary.contains("social: 0 min/day\ncom.facebook.katana"))
        assertTrue(summary.contains("Requested restrictions\nPrivate DNS configuration"))
        assertFalse(summary.contains("VPN configuration"))
    }

    @Test
    fun emptyRulesAndOvernightWindowsAreExplicit() {
        val summary = PolicySummary.describe(Policy(
            version = 1,
            timeLimits = Policy.TimeLimits(enabled = true),
            lockSchedule = Policy.LockSchedule(enabled = true, windows = listOf(
                Policy.LockSchedule.Window(listOf(1, 7), 22, 7)
            ))
        ))
        assertTrue(summary.contains("No app rules configured"))
        assertTrue(summary.contains("Sun, Sat: 22:00-07:00"))
    }
}
