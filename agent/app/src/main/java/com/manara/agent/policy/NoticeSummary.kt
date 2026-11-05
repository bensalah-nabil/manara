package com.manara.agent.policy

/** Short, lock-screen-safe lines for the managed notice: what the parent has configured, not what is confirmed working. */
object NoticeSummary {
    fun lines(policy: Policy?): List<String> {
        if (policy == null) return listOf("No policy received yet")
        val lines = mutableListOf<String>()
        val rules = policy.timeLimits.rules.size
        if (policy.timeLimits.enabled && rules > 0) {
            lines += "App time limits configured: $rules ${if (rules == 1) "rule" else "rules"}"
        }
        if (policy.siteFilter.enabled) lines += "Site filtering requested"
        if (policy.location.enabled) lines += "Location sharing requested, every ${policy.location.intervalMinutes} min"
        if (policy.usageReport.enabled) lines += "Daily app usage is reported to your parent"
        val windows = policy.lockSchedule?.takeIf { it.enabled }?.windows?.size ?: 0
        if (windows > 0) lines += "Scheduled lock: $windows ${if (windows == 1) "window" else "windows"}"
        with(policy.restrictions) {
            val count = listOf(blockVpnConfig, blockPrivateDnsConfig, blockFactoryReset, blockSafeBoot, blockAddUser).count { it }
            if (count > 0) lines += "Settings restrictions requested: $count"
        }
        if (lines.isEmpty()) lines += "No limits or collection configured"
        lines += "Call logs: not collected"
        return lines
    }
}
