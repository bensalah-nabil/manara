package com.manara.agent.enforcers

import com.manara.agent.policy.Policy

/**
 * Pure decision for [BrowserPolicyEnforcer]: the managed configuration Chrome gets.
 *
 * Every key, type and value is Chrome's own policy definition (Chromium source,
 * components/policy/resources/templates/policy_definitions, read 2026-11-07):
 * - `ForceGoogleSafeSearch`: boolean, Android 41+.
 * - `ForceYouTubeRestrict`: integer 0 (off), 1 (moderate), 2 (strict), Android 55+.
 * - `DnsOverHttpsMode`: string "off" disables Chrome's own DNS-over-HTTPS, Android 85+. Chrome
 *   then resolves through the system, so the site filter's Private DNS host applies.
 * - `URLBlocklist`: list of URL patterns, Android 86+. "example.com" covers its subdomains.
 *
 * Chrome on Android reads Boolean, String, Integer and String[] app-restriction values
 * (PolicyConverter.setPolicy, same source tree), which is what this map holds.
 * An empty map means: clear Chrome's managed configuration.
 */
object BrowserPolicyDecision {
    const val CHROME = "com.android.chrome"
    const val MAX_SITES = 200

    fun restrictions(browser: Policy.Browser): Map<String, Any> = buildMap {
        if (browser.safeSearch) put("ForceGoogleSafeSearch", true)
        youtubeLevel(browser.youtube)?.let { put("ForceYouTubeRestrict", it) }
        if (browser.secureDnsOff) put("DnsOverHttpsMode", "off")
        val sites = sites(browser.blockedSites)
        if (sites.isNotEmpty()) put("URLBlocklist", sites.toTypedArray())
    }

    /** Null for off or an unknown value, so a typo never turns a restriction on. */
    fun youtubeLevel(mode: String): Int? = when (mode) {
        "moderate" -> 1
        "strict" -> 2
        else -> null
    }

    /** Trimmed, lowercased, without a scheme's trailing slash, deduplicated, capped. */
    fun sites(raw: List<String>): List<String> = raw.asSequence()
        .map { it.trim().lowercase().removeSuffix("/") }
        .filter { it.isNotEmpty() && it.none(Char::isWhitespace) }
        .distinct()
        .take(MAX_SITES)
        .toList()

    /** Whether Chrome already has exactly this configuration, so an unchanged policy isn't re-sent. */
    fun same(current: Map<String, Any?>, desired: Map<String, Any>): Boolean {
        if (current.keys != desired.keys) return false
        return desired.all { (key, value) ->
            val now = current[key]
            if (value is Array<*> && now is Array<*>) value.contentEquals(now) else value == now
        }
    }
}
