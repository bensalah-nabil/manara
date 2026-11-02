package com.manara.agent.events

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Mirrors the `Event` schema in `api-spec/openapi.yaml`. `id` is generated
 * on the device (architecture.md §2.1/§3.2) so the backend can dedupe on
 * re-sync after a dropped connection — never accept or generate a
 * server-assigned id here instead.
 */
@Serializable
data class Event(
    val id: String,
    val kind: EventKind,
    val occurredAt: String, // ISO-8601, matches the API's date-time format
    val payload: JsonObject = JsonObject(emptyMap())
)

@Serializable
enum class EventKind {
    usage, location, call, lock, boot, heartbeat
}
