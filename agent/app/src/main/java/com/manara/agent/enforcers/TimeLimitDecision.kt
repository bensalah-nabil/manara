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

    data class Result(
        val toSuspend: List<String>,
        val toResume: List<String>,
        val newOverLimitState: Map<String, Boolean>,
        /** Rules whose limit was just crossed this check — report once, not every poll. */
        val justCrossedRules: List<Policy.TimeLimits.Rule>
    )

    fun decide(
        rules: List<Policy.TimeLimits.Rule>,
        usageMinutesByPackage: Map<String, Long>,
        previousOverLimitState: Map<String, Boolean>
    ): Result {
        val toSuspend = mutableListOf<String>()
        val toResume = mutableListOf<String>()
        val newState = mutableMapOf<String, Boolean>()
        val justCrossed = mutableListOf<Policy.TimeLimits.Rule>()

        for (rule in rules) {
            // A package with no usage stats entry yet (never opened today) counts
            // as zero, not a lookup failure.
            val usedMinutes = rule.packages.sumOf { usageMinutesByPackage[it] ?: 0L }
            val isOverLimit = usedMinutes >= rule.dailyMinutes
            newState[rule.category] = isOverLimit

            if (isOverLimit) {
                toSuspend += rule.packages
                if (previousOverLimitState[rule.category] != true) {
                    justCrossed += rule
                }
            } else {
                toResume += rule.packages
            }
        }

        return Result(toSuspend, toResume, newState, justCrossed)
    }
}
