package com.manara.agent.enforcers

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy

/**
 * Holds the active enforcers. SyncManager, enrollment and release go through this registry and
 * never name a concrete enforcer: a new capability is one class plus one line in
 * DefaultEnforcers, nothing else (architecture.md §2.2).
 */
class EnforcerRegistry(
    private val enforcers: List<PolicyEnforcer>,
    /**
     * Rules need device-owner rights. Before setup has made Manara the manager, every enforcer
     * would fail with SecurityException and report it as a broken protection (seen on the
     * SM-A528B while its setup was still running), so nothing is applied until then.
     */
    private val isManaged: () -> Boolean = { true },
    /** Told about a rule that threw while applying; the others still run. */
    private val onFailure: (enforcerId: String, error: Exception) -> Unit = { _, _ -> },
    /** Told about a rule that applied without throwing, so a failure reported earlier can clear. */
    private val onApplied: (enforcerId: String) -> Unit = {},
) {

    /**
     * Applies every rule. One that throws no longer stops the ones after it, nor the commands in
     * the same sync, which the server has already marked delivered (audit 2026-11-21). The failure
     * is reported, and each rule's own health checks still show a broken protection to the parent.
     */
    fun applyAll(policy: Policy) {
        if (!isManaged()) return
        enforcers.forEach { enforcer ->
            try {
                enforcer.apply(policy)
            } catch (e: Exception) {
                onFailure(enforcer.id, e)
                return@forEach
            }
            onApplied(enforcer.id)
        }
    }

    /**
     * Lifts every rule for a release ([PolicyEnforcer.release]). One rule that throws no longer
     * stops the others, nor the release itself, which would otherwise fail the same way on every
     * retry and leave the phone managed with a token the server has revoked (audit 2026-11-21).
     * Clearing the owner afterwards lifts whatever Android policy that rule had set.
     */
    fun releaseAll() {
        if (!isManaged()) return
        enforcers.forEach { enforcer ->
            try {
                enforcer.release()
            } catch (e: Exception) {
                onFailure(enforcer.id, e)
            }
        }
    }

    fun collectAllEvents(): List<Event> =
        enforcers.flatMap { it.collectEvents() }

    fun find(id: String): PolicyEnforcer? = enforcers.find { it.id == id }
}
