package com.manara.agent.ui

import com.manara.agent.policy.CollectionStatusSummary
import com.manara.agent.policy.Policy

/** Pure. Which of the app's few screens the phone is on. */
object HomeModel {
    enum class Screen {
        /** Not connected to a parent account yet. */
        CONNECT,
        /** Connected, but Manara doesn't manage the phone yet: guided setup. */
        SETUP,
        /** The everyday screen of a managed phone. */
        MANAGED,
    }

    fun screen(enrolled: Boolean, deviceOwner: Boolean): Screen = when {
        deviceOwner && enrolled -> Screen.MANAGED
        enrolled -> Screen.SETUP
        else -> Screen.CONNECT
    }

    /** Guided setup needs Android 11's wireless debugging. */
    fun setupSupported(sdkInt: Int): Boolean = sdkInt >= 30
}

/**
 * Pure. What the child's screen says: what the parent can see, which rules
 * are on, and what needs fixing. Kept to what the parent has actually turned on,
 * in plain words, because the child must always be able to see it (ADR-0001).
 */
object ChildView {
    data class Line(val title: String, val detail: String)

    enum class Fix { USAGE_ACCESS, LOCATION_SETTING }

    data class Attention(val text: String, val fix: Fix)

    data class View(
        val seen: List<Line>,
        val rules: List<Line>,
        val attention: List<Attention>,
        val lastContact: String,
    )

    fun build(
        policy: Policy?,
        usage: CollectionStatusSummary.Usage,
        location: CollectionStatusSummary.LocationStatus,
        lastSyncAt: Long?,
        now: Long,
    ): View = View(
        seen = seen(policy),
        rules = rules(policy),
        attention = attention(policy, usage, location),
        lastContact = lastContact(lastSyncAt, now),
    )

    fun seen(policy: Policy?): List<Line> = buildList {
        if (policy?.location?.enabled == true) {
            add(Line("Where this phone is", "Sent every ${policy.location.intervalMinutes} minutes. A notice shows while it's on."))
        }
        if (policy?.usageReport?.enabled == true) {
            add(Line("Time spent in each app", "Minutes per app today, sent about once an hour."))
        }
        if (policy?.timeLimits?.enabled == true && policy.timeLimits.rules.isNotEmpty()) {
            add(Line("When a time limit is reached", "Which limit, not what you were doing."))
        }
        add(Line("Whether Manara is working", "For example if a setting it needs was turned off."))
    }

    fun rules(policy: Policy?): List<Line> = buildList {
        if (policy == null) return@buildList
        val limits = policy.timeLimits
        if (limits.enabled) {
            limits.rules.forEach { rule ->
                val apps = rule.packages.size
                val appsText = if (apps == 1) "1 app" else "$apps apps"
                val detail = if (rule.dailyMinutes == 0) "Blocked, $appsText" else "${minutes(rule.dailyMinutes)} a day, $appsText"
                add(Line(rule.category.ifBlank { "App limit" }.replaceFirstChar { it.uppercase() }, detail))
            }
        }
        val schedule = policy.lockSchedule
        if (schedule?.enabled == true) {
            schedule.windows.forEach { add(Line("Locked ${hour(it.fromHour)}–${hour(it.toHour)}", days(it.days))) }
        }
        if (policy.siteFilter.enabled) add(Line("Website filter", "Some websites are blocked."))
        val blocked = with(policy.restrictions) {
            listOfNotNull(
                "factory reset".takeIf { blockFactoryReset },
                "safe mode".takeIf { blockSafeBoot },
                "new users".takeIf { blockAddUser },
                "developer options".takeIf { blockDebugging },
                "VPN settings".takeIf { blockVpnConfig },
                "Private DNS settings".takeIf { blockPrivateDnsConfig },
            )
        }
        if (blocked.isNotEmpty()) add(Line("Settings you can't change", blocked.joinToString(", ").replaceFirstChar { it.uppercase() }))
        browserRules(policy.browser)?.let { add(Line("Chrome", it)) }
    }

    /** Every Chrome rule in one sentence, or null when Chrome is left alone. */
    fun browserRules(browser: Policy.Browser): String? {
        val sites = com.manara.agent.enforcers.BrowserPolicyDecision.sites(browser.blockedSites).size
        val parts = listOfNotNull(
            "SafeSearch on Google".takeIf { browser.safeSearch },
            when (com.manara.agent.enforcers.BrowserPolicyDecision.youtubeLevel(browser.youtube)) {
                1 -> "YouTube Restricted Mode"
                2 -> "YouTube strict Restricted Mode"
                else -> null
            },
            "Chrome's own secure DNS is off, so the website filter applies".takeIf { browser.secureDnsOff },
            when (sites) {
                0 -> null
                1 -> "1 website blocked"
                else -> "$sites websites blocked"
            },
        )
        return parts.takeIf { it.isNotEmpty() }?.joinToString(". ")?.plus(".")
    }

    fun attention(
        policy: Policy?,
        usage: CollectionStatusSummary.Usage,
        location: CollectionStatusSummary.LocationStatus,
    ): List<Attention> = buildList {
        if (CollectionStatusSummary.usageDataNeeded(policy) && usage == CollectionStatusSummary.Usage.ACCESS_MISSING) {
            add(Attention("Usage access is off for Manara, so app limits can't be counted.", Fix.USAGE_ACCESS))
        }
        if (policy?.location?.enabled == true && location.toggleOn == false) {
            add(Attention("Location is turned off on this phone.", Fix.LOCATION_SETTING))
        }
    }

    fun lastContact(lastSyncAt: Long?, now: Long): String {
        if (lastSyncAt == null || lastSyncAt <= 0L) return "Not connected yet"
        val minutes = (now - lastSyncAt) / 60_000
        return when {
            minutes < 1 -> "Connected just now"
            minutes < 60 -> "Last connected $minutes min ago"
            minutes < 48 * 60 -> "Last connected ${minutes / 60} h ago"
            else -> "Last connected ${minutes / (24 * 60)} days ago"
        }
    }

    private fun minutes(value: Int): String = when {
        value < 60 -> "$value min"
        value % 60 == 0 -> "${value / 60} h"
        else -> "${value / 60} h ${value % 60} min"
    }

    private fun hour(value: Int): String = value.toString().padStart(2, '0') + ":00"

    private val DAY_NAMES = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

    /** Days are 1 (Sunday) to 7 (Saturday), as in the policy and java.util.Calendar. */
    private fun days(days: List<Int>): String {
        val sorted = days.filter { it in 1..7 }.distinct().sorted()
        return when (sorted) {
            (1..7).toList() -> "Every day"
            (2..6).toList() -> "Weekdays"
            listOf(1, 7) -> "Weekends"
            else -> sorted.joinToString(", ") { DAY_NAMES[it - 1] }
        }
    }
}
