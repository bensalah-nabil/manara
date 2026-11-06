package com.manara.agent.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Bump together with a migration from the previous version; ManaraDatabaseMigrationsTest checks the chain. */
const val MANARA_DB_VERSION = 4

/**
 * The policy cache, event queue, command-ack queue, and health state share
 * one database so health transitions and their events can commit together.
 * Schemas are exported to `app/schemas/` so each shipped version is on record.
 */
@Database(
     entities = [PolicyEntity::class, EventEntity::class, CommandAckEntity::class, HealthStateEntity::class,
         LocationObservationEntity::class],
     version = MANARA_DB_VERSION,
    exportSchema = true
)
abstract class ManaraDatabase : RoomDatabase() {
    abstract fun policyDao(): PolicyDao
    abstract fun eventDao(): EventDao
    abstract fun commandAckDao(): CommandAckDao
    abstract fun healthStateDao(): HealthStateDao
    abstract fun locationObservationDao(): LocationObservationDao

    companion object {
        // Version 2 originally shipped with a destructive fallback; once that was removed, a phone still on
        // version 1 crashed on every database access (found on an SM-A528B upgraded from the 11-02 build).
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `command_acks` (`commandId` TEXT NOT NULL, `status` TEXT NOT NULL, `detail` TEXT, `enqueuedAt` INTEGER NOT NULL, PRIMARY KEY(`commandId`))")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `location_observation` (`id` INTEGER NOT NULL, `eventId` TEXT NOT NULL, `sampleAt` INTEGER, `savedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `health_states` (`enforcerId` TEXT NOT NULL, `check` TEXT NOT NULL, `healthy` INTEGER, PRIMARY KEY(`enforcerId`, `check`))")
            }
        }

        /** Every shipped version must be able to reach [MANARA_DB_VERSION] through these. */
        val MIGRATIONS: Array<Migration> by lazy { arrayOf(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4) }

        @Volatile private var instance: ManaraDatabase? = null

        fun get(context: Context): ManaraDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ManaraDatabase::class.java,
                    "manara.db"
                ).addMigrations(*MIGRATIONS).build().also { instance = it }
            }
    }
}
