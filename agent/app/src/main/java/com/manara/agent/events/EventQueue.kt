package com.manara.agent.events

import com.manara.agent.storage.EventEntity
import com.manara.agent.storage.ManaraDatabase
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * The local append-only queue (architecture.md §2.1). Every observation is
 * written here *before* any attempt to send it, keyed by its own
 * device-generated id so enqueuing the same event twice is a no-op and
 * dropping it once the backend confirms receipt is safe.
 */
class EventQueue(private val db: ManaraDatabase) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun enqueue(event: Event) {
        db.eventDao().insert(
            EventEntity(
                id = event.id,
                kind = event.kind.name,
                occurredAt = event.occurredAt,
                payloadJson = json.encodeToString(JsonObject.serializer(), event.payload),
                enqueuedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun drainBatch(limit: Int = 200): List<Event> =
        db.eventDao().oldest(limit).map { entity ->
            Event(
                id = entity.id,
                kind = EventKind.valueOf(entity.kind),
                occurredAt = entity.occurredAt,
                payload = json.decodeFromString(JsonObject.serializer(), entity.payloadJson)
            )
        }

    /** Call once the backend has confirmed these ids are durably stored. */
    suspend fun markAccepted(ids: List<String>) {
        if (ids.isNotEmpty()) db.eventDao().deleteByIds(ids)
    }

    suspend fun size(): Int = db.eventDao().count()
}
