package com.manara.agent.events

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

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
    usage, location, call, lock, boot, heartbeat, enforcement
}

/**
 * A protection that isn't actually in effect, or came back: [status] is
 * `failed` (the Android call errored or returned an error code), `missing`
 * (it was in effect earlier but isn't anymore) or `restored`. Never carries
 * user content.
 */
fun enforcementEvent(enforcer: String, status: String, detail: String?): Event = Event(
    id = UUID.randomUUID().toString(),
    kind = EventKind.enforcement,
    occurredAt = Instant.now().toString(),
    payload = JsonObject(
        buildMap {
            put("enforcer", JsonPrimitive(enforcer))
            put("status", JsonPrimitive(status))
            if (detail != null) put("detail", JsonPrimitive(detail))
        }
    )
)
