package com.manara.agent.enforcers

import com.manara.agent.policy.Policy

/**
 * The pure "which packages should be suspended right now" decision, kept
 * separate from [TimeLimitEnforcer]'s Android I/O (`UsageStatsManager`,
 * `DevicePolicyManager`) specifically so it's unit-testable without a
 * device — the actual suspend/resume calls still need the on-device
 * verification `docs/phase1-plan.md` step 3 calls for.
 */
object TimeLimitDecision {

    fun remainingMinutes(
        rule: Policy.TimeLimits.Rule,
        usageMinutesByPackage: Map<String, Long>
    ): Long = (rule.dailyMinutes.toLong() -
        rule.packages.sumOf { usageMinutesByPackage[it] ?: 0L }).coerceAtLeast(0L)

    data class Result(
        val toSuspend: List<String>,
        val toResume: List<String>,
        val newOverLimitState: Map<String, Boolean>,
        /** Pass back in as `previouslySuspendedPackages` on the next call. */
        val newSuspendedPackages: Set<String>,
        /** Rules whose limit was just crossed this check — report once, not every poll. */
        val justCrossedRules: List<Policy.TimeLimits.Rule>
    )

    /**
     * Usage can't be read (Usage Access was turned off). Reading that as "no usage" would unblock
     * everything, so one Settings switch would defeat every limit. What is blocked stays blocked,
     * and a 0-minute rule still applies because it needs no usage figure.
     */
    fun holdWithoutUsage(
        rules: List<Policy.TimeLimits.Rule>,
        previousOverLimitState: Map<String, Boolean>,
        previouslySuspendedPackages: Set<String>
    ): Result {
        val zeroRules = rules.filter { it.dailyMinutes == 0 }
        val toSuspend = (previouslySuspendedPackages intersect rules.flatMap { it.packages }.toSet()) +
            zeroRules.flatMap { it.packages }
        val state = rules.associate { rule ->
            rule.category to (rule.dailyMinutes == 0 || previousOverLimitState[rule.category] == true)
        }
        return Result(
            toSuspend = toSuspend.toList(),
            toResume = (previouslySuspendedPackages - toSuspend).toList(),
            newOverLimitState = state,
            newSuspendedPackages = toSuspend,
            justCrossedRules = zeroRules.filter { previousOverLimitState[it.category] != true }
        )
    }

    fun decide(
        rules: List<Policy.TimeLimits.Rule>,
        usageMinutesByPackage: Map<String, Long>,
        previousOverLimitState: Map<String, Boolean>,
        /**
         * What's actually suspended right now, from the last call's
         * [Result.newSuspendedPackages]. Needed because a package must be
         * resumed not only when its rule drops under the limit, but also
         * when its rule disappears entirely (policy disabled, rule removed,
         * limit raised past a rewrite) — a package never un-suspends
         * itself just because nothing mentions it anymore.
         */
        previouslySuspendedPackages: Set<String> = emptySet()
    ): Result {
        val toSuspend = mutableSetOf<String>()
        val newState = mutableMapOf<String, Boolean>()
        val justCrossed = mutableListOf<Policy.TimeLimits.Rule>()

        for (rule in rules) {
            // A package with no usage stats entry yet (never opened today) counts
            // as zero, not a lookup failure.
            val isOverLimit = remainingMinutes(rule, usageMinutesByPackage) == 0L
            newState[rule.category] = isOverLimit

            if (isOverLimit) {
                toSuspend += rule.packages
                if (previousOverLimitState[rule.category] != true) {
                    justCrossed += rule
                }
            }
        }

        // Anything suspended before that isn't in the new suspend set must be
        // explicitly resumed, whatever the reason it dropped out.
        val toResume = (previouslySuspendedPackages - toSuspend).toList()

        return Result(
            toSuspend = toSuspend.toList(),
            toResume = toResume,
            newOverLimitState = newState,
            newSuspendedPackages = toSuspend,
            justCrossedRules = justCrossed
        )
    }
}
