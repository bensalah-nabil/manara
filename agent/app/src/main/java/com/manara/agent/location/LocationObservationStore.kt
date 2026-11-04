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
        db.withTransaction {
            if (db.locationObservationDao().get()?.eventId == event.id) return@withTransaction
            EventQueue(db).enqueue(event)
            db.locationObservationDao().put(LocationObservationEntity(
                eventId = event.id,
                sampleAt = sampleAt?.takeIf { it > 0L },
                savedAt = clock()
            ))
        }
    }
}