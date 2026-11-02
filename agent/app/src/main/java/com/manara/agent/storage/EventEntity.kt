package com.manara.agent.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One row per queued observation (architecture.md §2.1). `id` is the
 * device-generated UUID from the `Event` domain model — also the Room
 * primary key, so re-enqueuing the same id is a no-op rather than a
 * duplicate row.
 */
@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val occurredAt: String,
    val payloadJson: String,
    val enqueuedAt: Long
)
