package com.manara.agent.enforcers

/**
 * Pure decision for [BrowserBlockEnforcer]. Only Chrome can be told to stop using its own encrypted
 * DNS ([BrowserPolicyDecision]), so any other browser can go around the site filter.
 */
object BrowserBlockDecision {
    data class Result(val toBlock: Set<String>, val toResume: Set<String>)

    /** Never blocked: the one managed browser, Android itself, its Settings, and Manara. */
    val NEVER_BLOCK = setOf(BrowserPolicyDecision.CHROME, "android", "com.android.settings", "com.manara.agent")

    /**
     * [previouslyBlocked] stays blocked while the rule is on even if Android stops listing it,
     * because a suspended app may drop out of the browser query.
     */
    fun decide(enabled: Boolean, browsers: Set<String>, previouslyBlocked: Set<String>): Result {
        val toBlock = if (enabled) (browsers + previouslyBlocked) - NEVER_BLOCK else emptySet()
        return Result(toBlock = toBlock, toResume = previouslyBlocked - toBlock)
    }
}
