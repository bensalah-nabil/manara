package com.manara.agent.enforcers

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy

/**
 * Holds the active enforcers. The sync manager (Phase 1, not yet built) and
 * the policy cache go through this registry and never name a concrete
 * enforcer — that's what makes adding call logging "one class + one line
 * here," nothing else (architecture.md §2.2).
 */
class EnforcerRegistry(
    private val enforcers: List<PolicyEnforcer>,
    /**
     * Rules need device-owner rights. Before setup has made Manara the manager, every enforcer
     * would fail with SecurityException and report it as a broken protection (seen on the
     * SM-A528B while its setup was still running), so nothing is applied until then.
     */
    private val isManaged: () -> Boolean = { true },
) {

    fun applyAll(policy: Policy) {
        if (!isManaged()) return
        enforcers.forEach { it.apply(policy) }
    }

    /** [applyAll] without the enforcers in [skip]. */
    fun applyAllExcept(policy: Policy, skip: Set<String>) {
        if (!isManaged()) return
        enforcers.filter { it.id !in skip }.forEach { it.apply(policy) }
    }

    fun collectAllEvents(): List<Event> =
        enforcers.flatMap { it.collectEvents() }

    fun find(id: String): PolicyEnforcer? = enforcers.find { it.id == id }
}
