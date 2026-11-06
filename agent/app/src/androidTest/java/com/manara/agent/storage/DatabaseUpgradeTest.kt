package com.manara.agent.storage

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/**
 * Builds a database exactly as each shipped version created it, then opens it with the current code.
 * Room validates every table against the current entities while opening, so a wrong or missing
 * migration fails here instead of on a child's phone. Uses its own throwaway database file.
 */
@RunWith(AndroidJUnit4::class)
class DatabaseUpgradeTest {
    private lateinit var context: Context
    private lateinit var name: String

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        name = "upgrade-test-${UUID.randomUUID()}.db"
    }

    @After
    fun tearDown() {
        context.deleteDatabase(name)
    }

    @Test fun upgradesFromVersion1() = upgradeFrom(1)
    @Test fun upgradesFromVersion2() = upgradeFrom(2)
    @Test fun upgradesFromVersion3() = upgradeFrom(3)

    private fun upgradeFrom(version: Int) {
        val file = context.getDatabasePath(name)
        file.parentFile?.mkdirs()
        SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
            SHIPPED_TABLES.take(TABLES_IN_VERSION.getValue(version)).forEach(db::execSQL)
            db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)")
            db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, 'shipped-v$version')")
            db.execSQL("INSERT INTO policy (id, version, json) VALUES ('${PolicyEntity.CURRENT}', 7, '{\"version\":7}')")
            db.execSQL("INSERT INTO events (id, kind, occurredAt, payloadJson, enqueuedAt) VALUES ('e1', 'enforcement', '2026-11-02T10:00:00Z', '{}', 1)")
            db.version = version
        }

        val upgraded = Room.databaseBuilder(context, ManaraDatabase::class.java, name)
            .addMigrations(*ManaraDatabase.MIGRATIONS)
            .build()
        try {
            runBlocking {
                val policy = upgraded.policyDao().get()
                assertNotNull("The cached policy must survive an upgrade from version $version", policy)
                assertEquals(7, policy!!.version)
                assertEquals(listOf("e1"), upgraded.eventDao().oldest(10).map { it.id })
                assertEquals(0, upgraded.query("SELECT * FROM command_acks", null).use { it.count })
                assertEquals(0, upgraded.query("SELECT * FROM health_states", null).use { it.count })
                assertEquals(0, upgraded.query("SELECT * FROM location_observation", null).use { it.count })
            }
            assertEquals(MANARA_DB_VERSION, upgraded.openHelper.readableDatabase.version)
        } finally {
            upgraded.close()
        }
    }

    private companion object {
        /** In the order the tables were added; copied from each version's generated Room code. */
        val SHIPPED_TABLES = listOf(
            "CREATE TABLE IF NOT EXISTS `policy` (`id` TEXT NOT NULL, `version` INTEGER NOT NULL, `json` TEXT NOT NULL, PRIMARY KEY(`id`))",
            "CREATE TABLE IF NOT EXISTS `events` (`id` TEXT NOT NULL, `kind` TEXT NOT NULL, `occurredAt` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, `enqueuedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            "CREATE TABLE IF NOT EXISTS `command_acks` (`commandId` TEXT NOT NULL, `status` TEXT NOT NULL, `detail` TEXT, `enqueuedAt` INTEGER NOT NULL, PRIMARY KEY(`commandId`))",
            "CREATE TABLE IF NOT EXISTS `health_states` (`enforcerId` TEXT NOT NULL, `check` TEXT NOT NULL, `healthy` INTEGER, PRIMARY KEY(`enforcerId`, `check`))"
        )
        val TABLES_IN_VERSION = mapOf(1 to 2, 2 to 3, 3 to 4)
    }
}
