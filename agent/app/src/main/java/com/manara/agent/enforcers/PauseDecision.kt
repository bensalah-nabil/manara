package com.manara.agent.enforcers

/**
 * Pure: which apps are paused, and who holds each one (ADR-0009).
 *
 * [Holds] maps a rule's id ("time-limit", "browser-block", ...) to the apps it holds closed. An app is
 * paused while at least one rule holds it, and reopens only when none does: a time limit ending must
 * not reopen an app a prayer pause still holds, and the other way round.
 */
object PauseDecision {

    data class Change(
        /** Every rule's holds after the change; a rule that holds nothing is absent. */
        val holds: Map<String, Set<String>>,
        /**
         * The apps the changing rule holds, to pause (again). Pausing an app that is already paused is
         * harmless, and re-pausing heals one that something else reopened.
         */
        val toPause: Set<String>,
        /** Apps nobody holds any more. Never an app another rule still holds. */
        val toResume: Set<String>,
    )

    /** [rule] now holds exactly [apps], replacing what it held before. An empty set lets go of all. */
    fun hold(holds: Map<String, Set<String>>, rule: String, apps: Set<String>): Change {
        val next = if (apps.isEmpty()) holds - rule else holds + (rule to apps)
        return Change(next, apps, paused(holds) - paused(next))
    }

    /** A release: everything reopens and nothing is held. */
    fun releaseAll(holds: Map<String, Set<String>>): Change = Change(emptyMap(), emptySet(), paused(holds))

    /** Every app at least one rule holds. */
    fun paused(holds: Map<String, Set<String>>): Set<String> = holds.values.flatten().toSet()

    /** The rules holding [app], for the block screen and the child's notice; empty if it isn't paused. */
    fun reasons(holds: Map<String, Set<String>>, app: String): Set<String> =
        holds.filterValues { app in it }.keys

    /**
     * The holds of a phone updated from before this record existed: each rule kept its own list
     * (TimeLimitEnforcer's `suspended_packages`, BrowserBlockEnforcer's `blocked_packages`). Every app
     * closed before the update stays closed after it.
     */
    fun migrate(lists: Map<String, Set<String>>): Map<String, Set<String>> = lists.filterValues { it.isNotEmpty() }
}
