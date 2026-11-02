package com.manara.agent.enforcers

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy

/**
 * Holds the active enforcers. The sync manager (Phase 1, not yet built) and
 * the policy cache go through this registry and never name a concrete
 * enforcer — that's what makes adding call logging "one class + one line
 * here," nothing else (architecture.md §2.2).
 */
class EnforcerRegistry(private val enforcers: List<PolicyEnforcer>) {

    fun applyAll(policy: Policy) {
        enforcers.forEach { it.apply(policy) }
    }

    fun collectAllEvents(): List<Event> =
        enforcers.flatMap { it.collectEvents() }

    fun find(id: String): PolicyEnforcer? = enforcers.find { it.id == id }
}
