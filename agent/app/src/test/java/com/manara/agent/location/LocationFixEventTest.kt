package com.manara.agent.location

import com.manara.agent.events.EventKind
import com.manara.agent.storage.LocationObservationEntity
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class LocationFixEventTest {
    private val now = Instant.parse("2026-11-07T12:00:00Z").toEpochMilli()

    @Test
    fun cachedFixKeepsItsProviderTime() {
        val fixTime = now - 5 * 60_000L
        assertEquals(Instant.ofEpochMilli(fixTime), LocationFixEvent.occurredAt(fixTime, now))
    }

    @Test
    fun missingOrFutureFixTimeFallsBackToNow() {
        assertEquals(Instant.ofEpochMilli(now), LocationFixEvent.occurredAt(0L, now))
        assertEquals(Instant.ofEpochMilli(now), LocationFixEvent.occurredAt(-1L, now))
        assertEquals(Instant.ofEpochMilli(now), LocationFixEvent.occurredAt(now + 1, now))
    }

    @Test
    fun buildCarriesFixTimeAndPayload() {
        val event = LocationFixEvent.build("e1", 36.8, 10.18, 12.5f, now - 1_000L, now)
        assertEquals("e1", event.id)
        assertEquals(EventKind.location, event.kind)
        assertEquals("2026-11-07T11:59:59Z", event.occurredAt)
        assertEquals(JsonPrimitive(36.8), event.payload["lat"])
        assertEquals(JsonPrimitive(10.18), event.payload["lng"])
        assertEquals(JsonPrimitive(12.5f), event.payload["accuracyMeters"])
    }

    private fun saved(eventId: String, sampleAt: Long?) =
        LocationObservationEntity(eventId = eventId, sampleAt = sampleAt, savedAt = now)

    @Test
    fun nothingSavedIsNeverADuplicate() {
        assertFalse(LocationObservationStore.isDuplicate(null, "e1", 100L))
    }

    @Test
    fun sameEventRetriedIsADuplicate() {
        assertTrue(LocationObservationStore.isDuplicate(saved("e1", 100L), "e1", 200L))
    }

    @Test
    fun sameFixRedeliveredUnderANewIdIsADuplicate() {
        assertTrue(LocationObservationStore.isDuplicate(saved("e1", 100L), "e2", 100L))
    }

    @Test
    fun differentFixIsNotADuplicate() {
        assertFalse(LocationObservationStore.isDuplicate(saved("e1", 100L), "e2", 200L))
    }

    @Test
    fun unknownSampleTimesNeverMatchEachOther() {
        assertFalse(LocationObservationStore.isDuplicate(saved("e1", null), "e2", null))
    }
}
