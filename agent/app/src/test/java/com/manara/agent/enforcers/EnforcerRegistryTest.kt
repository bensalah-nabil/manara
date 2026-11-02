package com.manara.agent.enforcers

import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A controllable enforcer for testing the registry in isolation — no Android, no Room. */
private class FakeEnforcer(override val id: String) : PolicyEnforcer {
    var lastAppliedVersion: Int? = null
    private var pendingEvents = listOf<Event>()

    override fun apply(policy: Policy) {
        lastAppliedVersion = policy.version
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents
        pendingEvents = emptyList()
        return events
    }

    fun queueEvent(event: Event) {
        pendingEvents = pendingEvents + event
    }
}

class EnforcerRegistryTest {

    @Test
    fun `applyAll calls apply on every registered enforcer`() {
        val a = FakeEnforcer("a")
        val b = FakeEnforcer("b")
        val registry = EnforcerRegistry(listOf(a, b))

        registry.applyAll(Policy(version = 7))

        assertEquals(7, a.lastAppliedVersion)
        assertEquals(7, b.lastAppliedVersion)
    }

    @Test
    fun `collectAllEvents flattens events from every enforcer, draining each`() {
        val a = FakeEnforcer("a")
        val b = FakeEnforcer("b")
        val event = Event(
            id = "1",
            kind = EventKind.heartbeat,
            occurredAt = "2026-11-02T00:00:00Z",
            payload = JsonObject(emptyMap())
        )
        a.queueEvent(event)
        val registry = EnforcerRegistry(listOf(a, b))

        val events = registry.collectAllEvents()
        assertEquals(listOf(event), events)

        // Draining again returns nothing — each enforcer clears on collect.
        assertEquals(emptyList<Event>(), registry.collectAllEvents())
    }

    @Test
    fun `find returns the enforcer with a matching id, or null`() {
        val a = FakeEnforcer("time-limit")
        val registry = EnforcerRegistry(listOf(a))

        assertEquals(a, registry.find("time-limit"))
        assertNull(registry.find("missing"))
    }
}
