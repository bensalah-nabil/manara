package com.manara.agent.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * The agent's one local database — policy cache and event queue share it
 * (architecture.md §2.1), nothing else does. `exportSchema = false` for
 * now; revisit once migrations actually matter (there's only ever been one
 * version of this schema so far).
 */
@Database(
    entities = [PolicyEntity::class, EventEntity::class],
    version = 1,
    exportSchema = false
)
abstract class ManaraDatabase : RoomDatabase() {
    abstract fun policyDao(): PolicyDao
    abstract fun eventDao(): EventDao

    companion object {
        @Volatile private var instance: ManaraDatabase? = null

        fun get(context: Context): ManaraDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ManaraDatabase::class.java,
                    "manara.db"
                ).build().also { instance = it }
            }
    }
}
