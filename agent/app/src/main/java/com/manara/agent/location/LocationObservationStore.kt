package com.manara.agent.location

import androidx.room.withTransaction
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.events.EventQueue
import com.manara.agent.storage.LocationObservationEntity
import com.manara.agent.storage.ManaraDatabase

class LocationObservationStore(
    private val db: ManaraDatabase,
    private val clock: () -> Long = System::currentTimeMillis
) {
    suspend fun record(event: Event, sampleAt: Long?) {
        require(event.kind == EventKind.location)
        val sample = sampleAt?.takeIf { it > 0L }
        db.withTransaction {
            if (isDuplicate(db.locationObservationDao().get(), event.id, sample)) return@withTransaction
            EventQueue(db).enqueue(event)
            db.locationObservationDao().put(LocationObservationEntity(
                eventId = event.id,
                sampleAt = sample,
                savedAt = clock()
            ))
        }
    }

    companion object {
        /**
         * Pure. The same event retried, or the same provider fix delivered
         * again: every delivery gets a fresh event id, so the id alone never
         * catches a redelivered fix; its provider time does.
         */
        fun isDuplicate(saved: LocationObservationEntity?, eventId: String, sampleAt: Long?): Boolean {
            if (saved == null) return false
            if (saved.eventId == eventId) return true
            return sampleAt != null && saved.sampleAt == sampleAt
        }
    }
}
