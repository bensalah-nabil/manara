package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TimeLimitDecisionTest {

    private fun rule(category: String, packages: List<String>, dailyMinutes: Int) =
        Policy.TimeLimits.Rule(category = category, packages = packages, dailyMinutes = dailyMinutes)

    @Test
    fun `losing usage data keeps what is blocked blocked`() {
        val social = rule("social", listOf("tiktok", "fb"), 60)
        val result = TimeLimitDecision.holdWithoutUsage(listOf(social), mapOf("social" to true), setOf("tiktok", "fb"))
        assertEquals(setOf("tiktok", "fb"), result.newSuspendedPackages)
        assertEquals(emptyList<String>(), result.toResume)
        assertEquals(emptyList<Policy.TimeLimits.Rule>(), result.justCrossedRules)
    }

    @Test
    fun `losing usage data blocks nothing new except a zero minute rule`() {
        val open = rule("social", listOf("tiktok"), 60)
        val zero = rule("games", listOf("game"), 0)
        val result = TimeLimitDecision.holdWithoutUsage(listOf(open, zero), emptyMap(), emptySet())
        assertEquals(listOf("game"), result.toSuspend)
        assertEquals(listOf(zero), result.justCrossedRules)
    }

    @Test
    fun `losing usage data still resumes an app whose rule was removed`() {
        val result = TimeLimitDecision.holdWithoutUsage(emptyList(), emptyMap(), setOf("tiktok"))
        assertEquals(listOf("tiktok"), result.toResume)
        assertEquals(emptySet<String>(), result.newSuspendedPackages)
    }

    @Test
    fun `remaining budget is shared across packages`() {
        val sharedRule = rule("social", listOf("first.app", "second.app"), 60)
        assertEquals(5L, TimeLimitDecision.remainingMinutes(
            sharedRule, mapOf("first.app" to 30L, "second.app" to 25L)
        ))
        assertEquals(60L, TimeLimitDecision.remainingMinutes(sharedRule, emptyMap()))
    }

    @Test
    fun `remaining budget agrees with enforcement at boundaries`() {
        for (limit in listOf(0, 1, 60)) {
            for (used in listOf(0L, 1L, 59L, 60L, 61L)) {
                val budgetRule = rule("social", listOf("target.app"), limit)
                val usage = mapOf("target.app" to used)
                val remaining = TimeLimitDecision.remainingMinutes(budgetRule, usage)
                assertEquals((limit.toLong() - used).coerceAtLeast(0L), remaining)
                assertEquals(remaining == 0L, TimeLimitDecision.decide(
                    listOf(budgetRule), usage, emptyMap()
                ).toSuspend.contains("target.app"))
            }
        }
    }

    @Test
    fun `under the limit suspends nothing`() {
        val result = TimeLimitDecision.decide(
            rules = listOf(rule("social", listOf("com.instagram.android"), 60)),
            usageMinutesByPackage = mapOf("com.instagram.android" to 30L),
            previousOverLimitState = emptyMap()
        )

        assertEquals(emptyList<String>(), result.toSuspend)
        assertEquals(emptySet<String>(), result.newSuspendedPackages)
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
            previousOverLimitState = first.newOverLimitState,
            previouslySuspendedPackages = first.newSuspendedPackages
        )
        assertEquals(listOf("com.instagram.android"), second.toSuspend)
        assertEquals(emptyList<Policy.TimeLimits.Rule>(), second.justCrossedRules)
    }

    @Test
    fun `dropping under the limit resumes the package`() {
        val r = rule("social", listOf("com.instagram.android"), 60)
        val suspended = TimeLimitDecision.decide(
            rules = listOf(r),
            usageMinutesByPackage = mapOf("com.instagram.android" to 60L),
            previousOverLimitState = emptyMap()
        )

        // New day, usage reset to zero, same rule still in the policy.
        val resumed = TimeLimitDecision.decide(
            rules = listOf(r),
            usageMinutesByPackage = mapOf("com.instagram.android" to 0L),
            previousOverLimitState = suspended.newOverLimitState,
            previouslySuspendedPackages = suspended.newSuspendedPackages
        )

        assertEquals(emptyList<String>(), resumed.toSuspend)
        assertEquals(listOf("com.instagram.android"), resumed.toResume)
    }

    @Test
    fun `the rule disappearing entirely still resumes a previously-suspended package`() {
        // This is the exact bug found testing on a real phone: "resume" sent a
        // policy with no rules at all (time limits disabled), and the package
        // stayed suspended because nothing in the old per-rule-only logic ever
        // told it to resume.
        val r = rule("social", listOf("com.instagram.android"), 0) // limit=0, suspends immediately
        val suspended = TimeLimitDecision.decide(
            rules = listOf(r),
            usageMinutesByPackage = emptyMap(),
            previousOverLimitState = emptyMap()
        )
        assertEquals(listOf("com.instagram.android"), suspended.toSuspend)

        val afterDisabling = TimeLimitDecision.decide(
            rules = emptyList(), // policy.timeLimits.enabled = false, as the UI sends
            usageMinutesByPackage = emptyMap(),
            previousOverLimitState = suspended.newOverLimitState,
            previouslySuspendedPackages = suspended.newSuspendedPackages
        )

        assertEquals(listOf("com.instagram.android"), afterDisabling.toResume)
        assertEquals(emptySet<String>(), afterDisabling.newSuspendedPackages)
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

        assertEquals(emptyList<String>(), result.toSuspend)
    }
}
