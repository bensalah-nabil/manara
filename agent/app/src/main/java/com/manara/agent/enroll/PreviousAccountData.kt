package com.manara.agent.enroll

import androidx.room.withTransaction
import com.manara.agent.storage.ManaraDatabase

/**
 * What a phone collected for the parent account it was enrolled in, and
 * hadn't uploaded yet. Moving the phone to another account discards it:
 * data gathered for one parent never goes to another.
 *
 * Health states are facts about the phone, not account data, but they are
 * reset to unknown rather than kept. The tracker only reports changes, so
 * a protection that was already broken would otherwise never reach the
 * new parent.
 */
class PreviousAccountData(private val db: ManaraDatabase) {
    suspend fun discard() {
        db.withTransaction {
            db.eventDao().deleteAll()
            db.commandAckDao().deleteAll()
            db.locationObservationDao().clear()
            db.healthStateDao().forgetAll()
        }
    }
}
