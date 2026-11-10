package com.manara.agent.ui

import com.manara.agent.policy.CollectionStatusSummary
import com.manara.agent.R
import com.manara.agent.enforcers.BrowserPolicyDecision
import com.manara.agent.policy.Policy
import com.manara.agent.text.Words

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
 * The wording comes from string resources through [Words], in the phone's language.
 */
object ChildView {
    data class Line(val title: String, val detail: String)

    enum class Fix { USAGE_ACCESS, LOCATION_SETTING }

    data class Attention(val text: String, val fix: Fix)

    data class View(
        val seen: List<Line>,
        val neverShared: String,
        val rules: List<Line>,
        val attention: List<Attention>,
        val lastContact: String,
    )

    fun build(
        words: Words,
        policy: Policy?,
        usage: CollectionStatusSummary.Usage,
        location: CollectionStatusSummary.LocationStatus,
        lastSyncAt: Long?,
        now: Long,
        extraRules: List<Line> = emptyList(),
    ): View = View(
        seen = seen(words, policy),
        neverShared = neverShared(words, policy),
        rules = extraRules + rules(words, policy),
        attention = attention(words, policy, usage, location),
        lastContact = lastContact(words, lastSyncAt, now),
    )

    fun seen(words: Words, policy: Policy?): List<Line> = buildList {
        if (policy?.location?.enabled == true) {
            add(Line(words.get(R.string.seen_location_title), words.get(R.string.seen_location_detail, policy.location.intervalMinutes)))
        }
        if (policy?.usageReport?.enabled == true) {
            add(Line(words.get(R.string.seen_usage_title), words.get(R.string.seen_usage_detail)))
        }
        if (policy?.timeLimits?.enabled == true && policy.timeLimits.rules.isNotEmpty()) {
            add(Line(words.get(R.string.seen_limit_title), words.get(R.string.seen_limit_detail)))
        }
        if (policy?.callLog?.enabled == true) {
            add(Line(words.get(R.string.seen_calls_title), words.get(R.string.seen_calls_detail)))
            add(Line(words.get(R.string.seen_app_calls_title), words.get(R.string.seen_app_calls_detail)))
        }
        add(Line(words.get(R.string.seen_health_title), words.get(R.string.seen_health_detail)))
    }

    /** The promise changes with the rule: it must never say calls are private while their details are sent. */
    fun neverShared(words: Words, policy: Policy?): String =
        words.get(if (policy?.callLog?.enabled == true) R.string.never_shared_calls else R.string.never_shared)

    fun rules(words: Words, policy: Policy?): List<Line> = buildList {
        if (policy == null) return@buildList
        val separator = words.get(R.string.list_separator)
        val limits = policy.timeLimits
        if (limits.enabled) {
            limits.rules.forEach { rule ->
                val appsText = if (rule.allGames) words.get(R.string.rule_all_games) else words.plural(R.plurals.apps_count, rule.packages.size)
                val detail = if (rule.dailyMinutes == 0) words.get(R.string.rule_blocked, appsText)
                else words.get(R.string.rule_daily, minutes(words, rule.dailyMinutes), appsText)
                add(Line(categoryName(words, rule.category), detail))
            }
        }
        val schedule = policy.lockSchedule
        if (schedule?.enabled == true) {
            schedule.windows.forEach { add(Line(words.get(R.string.rule_locked, hour(it.fromHour), hour(it.toHour)), days(words, it.days))) }
        }
        if (policy.siteFilter.enabled) add(Line(words.get(R.string.rule_filter_title), words.get(R.string.rule_filter_detail)))
        val blocked = with(policy.restrictions) {
            listOfNotNull(
                R.string.restrict_factory_reset.takeIf { blockFactoryReset },
                R.string.restrict_safe_mode.takeIf { blockSafeBoot },
                R.string.restrict_new_users.takeIf { blockAddUser },
                R.string.restrict_developer.takeIf { blockDebugging },
                R.string.restrict_date_time.takeIf { blockDateTime },
                R.string.restrict_vpn.takeIf { blockVpnConfig },
                R.string.restrict_private_dns.takeIf { blockPrivateDnsConfig },
            ).map { words.get(it) }
        }
        if (blocked.isNotEmpty()) add(Line(words.get(R.string.restrict_title), blocked.joinToString(separator).replaceFirstChar { it.uppercase() }))
        browserRules(words, policy.browser)?.let { add(Line(words.get(R.string.chrome_title), it)) }
    }

    /**
     * A rule's name as the child reads it. The console's two card rules are stored under fixed English
     * names ("Social media", "Games"), so they are shown in the phone's language; any other name is the
     * parent's own wording.
     */
    fun categoryName(words: Words, category: String): String = when {
        category.isBlank() -> words.get(R.string.rule_app_limit)
        category == "Social media" -> words.get(R.string.rule_social)
        category == "Games" -> words.get(R.string.rule_games)
        else -> category.replaceFirstChar { it.uppercase() }
    }

    /** Every Chrome rule in one sentence, or null when Chrome is left alone. */
    fun browserRules(words: Words, browser: Policy.Browser): String? {
        val sites = BrowserPolicyDecision.sites(browser.blockedSites).size
        val parts = listOfNotNull(
            words.get(R.string.chrome_safesearch).takeIf { browser.safeSearch },
            when (BrowserPolicyDecision.youtubeLevel(browser.youtube)) {
                1 -> words.get(R.string.chrome_youtube)
                2 -> words.get(R.string.chrome_youtube_strict)
                else -> null
            },
            words.get(R.string.chrome_secure_dns).takeIf { browser.secureDnsOff },
            if (sites == 0) null else words.plural(R.plurals.sites_blocked, sites),
            words.get(R.string.chrome_other_browsers).takeIf { browser.blockOtherBrowsers },
        )
        return parts.takeIf { it.isNotEmpty() }?.joinToString(". ")?.plus(".")
    }

    fun attention(
        words: Words,
        policy: Policy?,
        usage: CollectionStatusSummary.Usage,
        location: CollectionStatusSummary.LocationStatus,
    ): List<Attention> = buildList {
        if (CollectionStatusSummary.usageDataNeeded(policy) && usage == CollectionStatusSummary.Usage.ACCESS_MISSING) {
            add(Attention(words.get(R.string.attention_usage), Fix.USAGE_ACCESS))
        }
        if (policy?.location?.enabled == true && location.toggleOn == false) {
            add(Attention(words.get(R.string.attention_location), Fix.LOCATION_SETTING))
        }
    }

    fun lastContact(words: Words, lastSyncAt: Long?, now: Long): String {
        if (lastSyncAt == null || lastSyncAt <= 0L) return words.get(R.string.contact_never)
        val minutes = (now - lastSyncAt) / 60_000
        return when {
            minutes < 1 -> words.get(R.string.contact_now)
            minutes < 60 -> words.get(R.string.contact_minutes, minutes)
            minutes < 48 * 60 -> words.get(R.string.contact_hours, minutes / 60)
            else -> words.get(R.string.contact_days, minutes / (24 * 60))
        }
    }

    fun minutes(words: Words, value: Int): String = when {
        value < 60 -> words.get(R.string.duration_min, value)
        value % 60 == 0 -> words.get(R.string.duration_h, value / 60)
        else -> words.get(R.string.duration_h_min, value / 60, value % 60)
    }

    private fun hour(value: Int): String = value.toString().padStart(2, '0') + ":00"

    private val DAY_NAMES = listOf(R.string.day_sun, R.string.day_mon, R.string.day_tue, R.string.day_wed, R.string.day_thu, R.string.day_fri, R.string.day_sat)

    /** Days are 1 (Sunday) to 7 (Saturday), as in the policy and java.util.Calendar. */
    private fun days(words: Words, days: List<Int>): String {
        val sorted = days.filter { it in 1..7 }.distinct().sorted()
        return when (sorted) {
            (1..7).toList() -> words.get(R.string.days_every)
            (2..6).toList() -> words.get(R.string.days_weekdays)
            listOf(1, 7) -> words.get(R.string.days_weekends)
            else -> sorted.joinToString(words.get(R.string.list_separator)) { words.get(DAY_NAMES[it - 1]) }
        }
    }
}
