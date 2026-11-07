package com.manara.agent.policy

import com.manara.agent.enforcers.TimeLimitDecision

object PolicySummary {
    fun describe(policy: Policy?, usageMinutesByPackage: Map<String, Long>? = null): String {
        if (policy == null) return "No policy received"
        val lines = mutableListOf("Policy version: ${policy.version}", "", "Daily app limits")
        if (!policy.timeLimits.enabled) {
            lines += "Off"
        } else if (policy.timeLimits.rules.isEmpty()) {
            lines += "No app rules configured"
        } else {
            policy.timeLimits.rules.forEach { rule ->
                lines += "${rule.category}: ${rule.dailyMinutes} min/day"
                if (rule.packages.size > 1) lines += "Budget shared by ${rule.packages.size} apps"
                if (rule.packages.isEmpty()) lines += "No apps selected"
                rule.packages.forEach { packageName ->
                    lines += packageName
                    lines += if (usageMinutesByPackage == null) {
                        "Time left today: unavailable"
                    } else {
                        val remaining = policy.timeLimits.rules
                            .filter { packageName in it.packages }
                            .minOf { TimeLimitDecision.remainingMinutes(it, usageMinutesByPackage) }
                        "Time left today: $remaining min (estimated)"
                    }
                }
            }
        }
        lines += ""
        lines += when {
            !policy.siteFilter.enabled -> "Site filtering: off"
            policy.siteFilter.dnsHost.isNullOrBlank() -> "Site filtering: requested, DNS host missing"
            else -> "Site filtering: requested (${policy.siteFilter.dnsHost})"
        }
        lines += if (policy.location.enabled) {
            "Location collection: requested, every ${policy.location.intervalMinutes} min"
        } else {
            "Location collection: off"
        }
        lines += if (policy.usageReport.enabled) {
            "Daily app usage report: sent to your parent (minutes per app, about hourly)"
        } else {
            "Daily app usage report: off"
        }
        lines += if (policy.callLog.enabled) {
            "Call logs: not collected (unsupported, requested by policy)"
        } else {
            "Call logs: not collected (unsupported)"
        }
        lines += ""
        lines += "Scheduled locks"
        val schedule = policy.lockSchedule
        if (schedule == null || !schedule.enabled) {
            lines += "Off"
        } else if (schedule.windows.isEmpty()) {
            lines += "No windows configured"
        } else {
            schedule.windows.forEach { window ->
                val days = window.days.joinToString(", ") { day ->
                    listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat").getOrNull(day - 1) ?: "Unknown day ($day)"
                }
                lines += "${days.ifEmpty { "No days selected" }}: ${hour(window.fromHour)}-${hour(window.toHour)}"
            }
        }
        lines += ""
        lines += "Requested restrictions"
        val restrictions = policy.restrictions
        val requested = listOfNotNull(
            "VPN configuration".takeIf { restrictions.blockVpnConfig },
            "Private DNS configuration".takeIf { restrictions.blockPrivateDnsConfig },
            "Factory reset from Settings".takeIf { restrictions.blockFactoryReset },
            "Safe boot".takeIf { restrictions.blockSafeBoot },
            "Adding users".takeIf { restrictions.blockAddUser },
            "Developer options".takeIf { restrictions.blockDebugging }
        )
        lines += requested.ifEmpty { listOf("None") }
        lines += ""
        lines += "Chrome: " + (com.manara.agent.ui.ChildView.browserRules(policy.browser) ?: "no rules")
        return lines.joinToString("\n")
    }

    private fun hour(value: Int): String = value.toString().padStart(2, '0') + ":00"
}
