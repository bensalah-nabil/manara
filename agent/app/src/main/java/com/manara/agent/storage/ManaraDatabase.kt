package com.manara.agent.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * The agent's one local database — policy cache, event queue, and the
 * command-ack queue share it (architecture.md §2.1), nothing else does.
 * `exportSchema = false` for now; revisit once migrations actually matter.
 *
 * Bumped to version 2 for [CommandAckEntity] with a destructive fallback,
 * not a real migration -- there's no installed base with user data to
 * preserve yet (pre-release), so losing an in-flight event/ack queue on
 * upgrade is an acceptable, explicit tradeoff, not an oversight.
 */
@Database(
    entities = [PolicyEntity::class, EventEntity::class, CommandAckEntity::class],
    version = 2,
    exportSchema = false
)
abstract class ManaraDatabase : RoomDatabase() {
    abstract fun policyDao(): PolicyDao
    abstract fun eventDao(): EventDao
    abstract fun commandAckDao(): CommandAckDao

    companion object {
        @Volatile private var instance: ManaraDatabase? = null

        fun get(context: Context): ManaraDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ManaraDatabase::class.java,
                    "manara.db"
                ).fallbackToDestructiveMigration().build().also { instance = it }
            }
    }
}
