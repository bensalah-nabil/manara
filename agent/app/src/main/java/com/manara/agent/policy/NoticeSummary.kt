package com.manara.agent.policy

import com.manara.agent.R
import com.manara.agent.enforcers.BrowserPolicyDecision
import com.manara.agent.text.Words

/** Short, lock-screen-safe lines for the managed notice: what the parent has configured, not what is confirmed working. */
object NoticeSummary {
    /** [first] goes on top: what is happening right now, such as a prayer-time pause. */
    fun lines(words: Words, policy: Policy?, first: List<String> = emptyList()): List<String> {
        if (policy == null) return listOf(words.get(R.string.summary_no_policy))
        val lines = mutableListOf<String>()
        val rules = policy.timeLimits.rules.size
        if (policy.timeLimits.enabled && rules > 0) lines += words.get(R.string.summary_limits, rules)
        if (policy.siteFilter.enabled) lines += words.get(R.string.summary_filter)
        if (policy.location.enabled) lines += words.get(R.string.summary_location, policy.location.intervalMinutes)
        if (policy.usageReport.enabled) lines += words.get(R.string.summary_usage)
        val windows = policy.lockSchedule?.takeIf { it.enabled }?.windows?.size ?: 0
        if (windows > 0) lines += words.get(R.string.summary_lock, windows)
        with(policy.restrictions) {
            val count = listOf(blockVpnConfig, blockPrivateDnsConfig, blockFactoryReset, blockSafeBoot, blockAddUser, blockDebugging, blockDateTime).count { it }
            if (count > 0) lines += words.get(R.string.summary_restrictions, count)
        }
        if (BrowserPolicyDecision.restrictions(policy.browser).isNotEmpty()) lines += words.get(R.string.summary_chrome)
        if (policy.browser.blockOtherBrowsers) lines += words.get(R.string.summary_other_browsers)
        if (policy.callLog.enabled) lines += words.get(R.string.summary_calls)
        if (lines.isEmpty() && first.isEmpty()) lines += words.get(R.string.summary_nothing)
        if (!policy.callLog.enabled) lines += words.get(R.string.summary_no_calls)
        return first + lines
    }
}
