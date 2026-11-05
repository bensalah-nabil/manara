package com.manara.agent.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoticeSummaryTest {
    @Test
    fun absentPolicyDoesNotClaimAnything() {
        assertEquals(listOf("No policy received yet"), NoticeSummary.lines(null))
    }

    @Test
    fun emptyPolicySaysNothingIsConfigured() {
        assertEquals(
            listOf("No limits or collection configured", "Call logs: not collected"),
            NoticeSummary.lines(Policy(version = 1))
        )
    }

    @Test
    fun configuredFeaturesAreCountedNotNamed() {
        val lines = NoticeSummary.lines(Policy(
            version = 1,
            timeLimits = Policy.TimeLimits(true, listOf(
                Policy.TimeLimits.Rule("social", listOf("private.app.name"), 0),
                Policy.TimeLimits.Rule("games", listOf("other.app"), 30)
            )),
            siteFilter = Policy.SiteFilter(enabled = true),
            location = Policy.Location(enabled = true, intervalMinutes = 20),
            lockSchedule = Policy.LockSchedule(true, listOf(Policy.LockSchedule.Window(listOf(1), 22, 7))),
            restrictions = Policy.Restrictions(blockVpnConfig = true, blockSafeBoot = true)
        ))
        assertTrue(lines.contains("App time limits configured: 2 rules"))
        assertTrue(lines.contains("Site filtering requested"))
        assertTrue(lines.contains("Location sharing requested, every 20 min"))
        assertTrue(lines.contains("Scheduled lock: 1 window"))
        assertTrue(lines.contains("Settings restrictions requested: 2"))
        assertFalse(lines.any { it.contains("private.app.name") })
    }

    @Test
    fun disabledFeaturesAndCallLogRequestsAreNotListedAsActive() {
        val lines = NoticeSummary.lines(Policy(
            version = 1,
            timeLimits = Policy.TimeLimits(false, listOf(Policy.TimeLimits.Rule("social", listOf("a"), 5))),
            lockSchedule = Policy.LockSchedule(false, listOf(Policy.LockSchedule.Window(listOf(1), 1, 2))),
            callLog = Policy.CallLog(enabled = true)
        ))
        assertEquals(listOf("No limits or collection configured", "Call logs: not collected"), lines)
    }
}
