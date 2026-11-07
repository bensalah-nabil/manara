package com.manara.agent.location

import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

/**
 * Pure: turns one provider fix into a `location` event. Kept free of
 * `android.location.Location` so it's unit-testable without a device.
 */
object LocationFixEvent {
    /**
     * When the fix was taken, not when it reached us: a balanced-power
     * request can hand back a cached fix minutes old, or several batched
     * ones at once. Falls back to [nowMillis] when the provider gave no
     * time (0) or one ahead of this device's clock.
     */
    fun occurredAt(fixTimeMillis: Long, nowMillis: Long): Instant =
        Instant.ofEpochMilli(if (fixTimeMillis in 1..nowMillis) fixTimeMillis else nowMillis)

    fun build(
        id: String,
        latitude: Double,
        longitude: Double,
        accuracyMeters: Float,
        fixTimeMillis: Long,
        nowMillis: Long
    ): Event = Event(
        id = id,
        kind = EventKind.location,
        occurredAt = occurredAt(fixTimeMillis, nowMillis).toString(),
        payload = JsonObject(
            mapOf(
                "lat" to JsonPrimitive(latitude),
                "lng" to JsonPrimitive(longitude),
                "accuracyMeters" to JsonPrimitive(accuracyMeters)
            )
        )
    )
}
