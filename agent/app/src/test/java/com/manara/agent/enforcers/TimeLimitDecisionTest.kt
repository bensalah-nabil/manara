package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TimeLimitDecisionTest {

    private fun rule(category: String, packages: List<String>, dailyMinutes: Int) =
        Policy.TimeLimits.Rule(category = category, packages = packages, dailyMinutes = dailyMinutes)

    @Test
    fun `under the limit suspends nothing and resumes the package`() {
        val result = TimeLimitDecision.decide(
            rules = listOf(rule("social", listOf("com.instagram.android"), 60)),
            usageMinutesByPackage = mapOf("com.instagram.android" to 30L),
            previousOverLimitState = emptyMap()
        )

        assertEquals(emptyList<String>(), result.toSuspend)
        assertEquals(listOf("com.instagram.android"), result.toResume)
        assertEquals(emptyList<Policy.TimeLimits.Rule>(), result.justCrossedRules)
    }

    @Test
    fun `reaching the limit suspends and reports exactly once`() {
        val r = rule("social", listOf("com.instagram.android"), 60)

        val first = TimeLimitDecision.decide(
            rules = listOf(r),
            usageMinutesByPackage = mapOf("com.instagram.android" to 60L),
            previousOverLimitState = emptyMap()
        )
        assertEquals(listOf("com.instagram.android"), first.toSuspend)
        assertEquals(listOf(r), first.justCrossedRules)

        // Still over the limit on the next poll -- suspended again (idempotent),
        // but NOT reported a second time.
        val second = TimeLimitDecision.decide(
            rules = listOf(r),
            usageMinutesByPackage = mapOf("com.instagram.android" to 65L),
            previousOverLimitState = first.newOverLimitState
        )
        assertEquals(listOf("com.instagram.android"), second.toSuspend)
        assertEquals(emptyList<Policy.TimeLimits.Rule>(), second.justCrossedRules)
    }

    @Test
    fun `sums usage across every package in the rule`() {
        val result = TimeLimitDecision.decide(
            rules = listOf(rule("social", listOf("a", "b"), 60)),
            usageMinutesByPackage = mapOf("a" to 30L, "b" to 31L),
            previousOverLimitState = emptyMap()
        )

        assertTrue(result.toSuspend.containsAll(listOf("a", "b")))
    }

    @Test
    fun `a package with no usage stats entry counts as zero, not a crash`() {
        val result = TimeLimitDecision.decide(
            rules = listOf(rule("social", listOf("never.opened"), 60)),
            usageMinutesByPackage = emptyMap(),
            previousOverLimitState = emptyMap()
        )

        assertEquals(listOf("never.opened"), result.toResume)
    }
}
