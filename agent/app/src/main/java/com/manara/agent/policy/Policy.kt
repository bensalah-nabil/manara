package com.manara.agent.policy

import kotlinx.serialization.Serializable

/**
 * Mirrors the `Policy` schema in `api-spec/openapi.yaml`. Kept in lockstep
 * with the API contract (architecture.md §5) — a field added there gets
 * added here, and nowhere else decides what a policy looks like.
 *
 * Deliberately has no "hide notice" or "stealth" field, matching the API
 * spec's own comment to that effect — see ADR-0001.
 */
@Serializable
data class Policy(
    val version: Int,
    val timeLimits: TimeLimits = TimeLimits(),
    val siteFilter: SiteFilter = SiteFilter(),
    val location: Location = Location(),
    val callLog: CallLog = CallLog(),
    val lockSchedule: LockSchedule? = null,
    val restrictions: Restrictions = Restrictions(),
    val usageReport: UsageReport = UsageReport(),
    val browser: Browser = Browser()
) {
    /**
     * Chrome's managed configuration (capability-plan.md B2). All off by default, so Chrome is
     * left alone. [youtube] is "off", "moderate" or "strict"; anything else counts as off.
     */
    @Serializable
    data class Browser(
        val safeSearch: Boolean = false,
        val youtube: String = "off",
        val secureDnsOff: Boolean = false,
        val blockedSites: List<String> = emptyList()
    )

    @Serializable
    data class TimeLimits(
        val enabled: Boolean = false,
        val rules: List<Rule> = emptyList()
    ) {
        @Serializable
        data class Rule(
            val category: String,
            val packages: List<String> = emptyList(),
            val dailyMinutes: Int
        )
    }

    @Serializable
    data class SiteFilter(
        val enabled: Boolean = false,
        val dnsHost: String? = null
    )

    @Serializable
    data class Location(
        val enabled: Boolean = false,
        val intervalMinutes: Int = 15
    )

    @Serializable
    data class CallLog(
        val enabled: Boolean = false
    )

    /** Opt-in daily per-app minutes. Data leaves the phone, so it is shown on the notice and status screen while on. */
    @Serializable
    data class UsageReport(
        val enabled: Boolean = false
    )

    /** Closes the Settings-level bypasses. All off by default, so existing policies behave as before. */
    @Serializable
    data class Restrictions(
        val blockVpnConfig: Boolean = false,
        val blockPrivateDnsConfig: Boolean = false,
        val blockFactoryReset: Boolean = false,
        val blockSafeBoot: Boolean = false,
        val blockAddUser: Boolean = false,
        val blockDebugging: Boolean = false,
        /** Automatic date and time, and no changing it: a changed clock would escape a lock window or a daily limit. */
        val blockDateTime: Boolean = false
    )

    @Serializable
    data class LockSchedule(
        val enabled: Boolean = false,
        val windows: List<Window> = emptyList()
    ) {
        @Serializable
        data class Window(
            val days: List<Int>,
            val fromHour: Int,
            val toHour: Int
        )
    }
}
