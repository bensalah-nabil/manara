package com.manara.agent.enforcers

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy

/**
 * One enforcer per capability (architecture.md §2.2) — Open/Closed: adding
 * a new policy means adding one class and registering it in
 * [EnforcerRegistry], nothing else changes. Each implementation reads only
 * the slice of [Policy] it cares about; nothing requires it to look at the
 * rest.
 */
interface PolicyEnforcer {
    /** "time-limit", "location", ... — stable, used for lookups, never the class name. */
    val id: String

    /** Make the device match this policy. Called whenever the cached policy changes. */
    fun apply(policy: Policy)

    /** What to report back since the last call. May return an empty list. */
    fun collectEvents(): List<Event>
}
