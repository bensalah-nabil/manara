package com.manara.agent.enforcers

import android.content.Context
import android.content.SharedPreferences
import android.database.sqlite.SQLiteDatabase
import android.os.Process
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.manara.agent.events.EventQueue
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.enroll.PreviousAccountData
import com.manara.agent.location.LocationObservationStore
import com.manara.agent.policy.CollectionStatusReader
import com.manara.agent.policy.CollectionStatusSummary
import com.manara.agent.policy.Policy
import com.manara.agent.storage.PolicyEntity
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.CommandAck
import com.manara.agent.sync.CommandAckQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.Executor

@RunWith(AndroidJUnit4::class)
class HealthTrackerStorageTest {
    private lateinit var context: Context
    private lateinit var prefs: SharedPreferences
    private lateinit var db: ManaraDatabase
    private lateinit var databaseName: String

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        val crashId = InstrumentationRegistry.getArguments().getString("healthCrashId")
        if (crashId != null) {
            require(UUID.fromString(crashId).toString() == crashId)
        }
        databaseName = if (crashId == null) "health-test-${UUID.randomUUID()}.db"
            else "health-crash-$crashId.db"
        prefs = context.getSharedPreferences(databaseName, Context.MODE_PRIVATE)
        db = openDatabase()
    }

    @After
    fun tearDown() {
        db.close()
        context.deleteDatabase(databaseName)
        context.deleteSharedPreferences(databaseName)
    }

    private fun openDatabase(): ManaraDatabase =
        Room.databaseBuilder(context, ManaraDatabase::class.java, databaseName)
            .addMigrations(ManaraDatabase.MIGRATION_2_3, ManaraDatabase.MIGRATION_3_4)
            .build()

    private fun tracker(enforcer: String = "time-limit") = HealthTracker(db, prefs, enforcer)

    @Test
    fun terminateBetweenStateAndEventInsert() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("healthCrashMode") == "kill")
        require(InstrumentationRegistry.getArguments().containsKey("healthCrashId"))
        assertNull(db.healthStateDao().get("time-limit", "usage_access"))
        assertEquals(0, EventQueue(db).size())
        tracker().observe("usage_access", true)
        db.close()
        db = Room.databaseBuilder(context, ManaraDatabase::class.java, databaseName)
            .addMigrations(ManaraDatabase.MIGRATION_2_3, ManaraDatabase.MIGRATION_3_4)
            .setQueryCallback({ sql, _ ->
                if (sql.startsWith("INSERT OR IGNORE INTO `events`")) {
                    assertTrue(db.inTransaction())
                    db.openHelper.writableDatabase.query(
                        "SELECT healthy FROM health_states WHERE enforcerId = 'time-limit' AND `check` = 'usage_access'"
                    ).use { cursor ->
                        assertTrue(cursor.moveToFirst())
                        assertEquals(0, cursor.getInt(0))
                    }
                    db.openHelper.writableDatabase.query("SELECT COUNT(*) FROM events").use { cursor ->
                        assertTrue(cursor.moveToFirst())
                        assertEquals(0, cursor.getInt(0))
                    }
                    assertTrue(prefs.edit().putInt("terminated_pid", Process.myPid()).commit())
                    Process.killProcess(Process.myPid())
                    error("Process termination did not occur")
                }
            }, Executor { it.run() })
            .build()
        tracker().observe("usage_access", false)
        fail("The event insert boundary was not intercepted")
    }

    @Test
    fun interruptedTransitionRollsBackAndCanRetry() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("healthCrashMode") == "verify")
        require(InstrumentationRegistry.getArguments().containsKey("healthCrashId"))
        val terminatedPid = prefs.getInt("terminated_pid", -1)
        assertTrue("The first process must have reached the insert boundary", terminatedPid > 0)
        assertTrue("Verification must run in a new process", terminatedPid != Process.myPid())
        assertEquals(true, db.healthStateDao().get("time-limit", "usage_access")?.healthy)
        val queue = EventQueue(db)
        assertEquals(0, queue.size())
        tracker().observe("usage_access", false)
        val original = queue.drainBatch().single()
        assertEquals("\"missing\"", original.payload["status"].toString())
        tracker().observe("usage_access", false)
        assertEquals(listOf(original), queue.drainBatch())
    }

    @Test
    fun transitionsSurviveReopenWithoutCollection() = runBlocking {
        tracker().observe("usage_access", false)
        val original = EventQueue(db).drainBatch().single()
        db.close()
        db = openDatabase()
        tracker().observe("usage_access", false)
        assertEquals(listOf(original), EventQueue(db).drainBatch())
        tracker().observe("usage_access", true)
        assertEquals(setOf("\"missing\"", "\"restored\""),
            EventQueue(db).drainBatch().map { it.payload["status"].toString() }.toSet())
    }

    @Test
    fun failedEnqueueRollsBackStateAndCanRetry() = runBlocking {
        db.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER reject_health_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test failure'); END"
        )
        try {
            tracker().observe("usage_access", false)
            fail("Expected the injected enqueue failure")
        } catch (expected: android.database.sqlite.SQLiteException) {
            assertTrue(expected.message.orEmpty().contains("test failure"))
        }
        assertNull(db.healthStateDao().get("time-limit", "usage_access"))
        assertEquals(0, EventQueue(db).size())
        db.openHelper.writableDatabase.execSQL("DROP TRIGGER reject_health_event")
        tracker().observe("usage_access", false)
        assertEquals(false, db.healthStateDao().get("time-limit", "usage_access")?.healthy)
        assertEquals(1, EventQueue(db).size())
    }

    @Test
    fun concurrentInstancesQueueOneTransition() = runBlocking {
        (1..12).map {
            async(Dispatchers.IO) { tracker().observe("usage_access", false) }
        }.awaitAll()
        assertEquals(1, EventQueue(db).size())
        assertEquals(false, db.healthStateDao().get("time-limit", "usage_access")?.healthy)
    }

    @Test
    fun acceptedEventsAreNotRecreatedByUnchangedHealth() = runBlocking {
        tracker().observe("usage_access", false)
        val queue = EventQueue(db)
        queue.markAccepted(queue.drainBatch().map { it.id })
        tracker().observe("usage_access", false)
        assertEquals(0, queue.size())
    }

    @Test
    fun legacyStateIsImportedAndForgetDoesNotResurrectIt() = runBlocking {
        assertTrue(prefs.edit().putBoolean("health_usage_access", false).commit())
        tracker().observe("usage_access", true)
        val queue = EventQueue(db)
        assertEquals("\"restored\"", queue.drainBatch().single().payload["status"].toString())
        tracker().forget("usage_access")
        tracker().observe("usage_access", true)
        assertEquals(1, queue.size())
        tracker().forget("usage_access")
        tracker().observe("usage_access", false)
        assertEquals(2, queue.size())
    }

    @Test
    fun checkAndEnforcerStateAreIndependent() = runBlocking {
        tracker().observe("first", false)
        tracker().observe("second", false)
        tracker("location").observe("first", false)
        tracker().forget("first")
        assertFalse(db.healthStateDao().get("time-limit", "second")!!.healthy!!)
        assertFalse(db.healthStateDao().get("location", "first")!!.healthy!!)
        assertEquals(3, EventQueue(db).size())
    }

    @Test
    fun versionTwoMigrationPreservesQueuedEvent() = runBlocking {
        seedMigrationRows()
        tracker().observe("usage_access", false)
        val original = EventQueue(db).drainBatch().single()
        db.close()
        SQLiteDatabase.openDatabase(context.getDatabasePath(databaseName).path, null,
            SQLiteDatabase.OPEN_READWRITE).use { legacy ->
            legacy.execSQL("DROP TABLE health_states")
            legacy.execSQL("DROP TABLE location_observation")
            legacy.version = 2
        }
        db = openDatabase()
        assertEquals(listOf(original), EventQueue(db).drainBatch())
        assertNull(db.healthStateDao().get("time-limit", "usage_access"))
        assertNull(db.locationObservationDao().get())
        assertEquals(4, db.openHelper.readableDatabase.version)
        assertMigrationRows()
    }

    private suspend fun seedMigrationRows() {
        db.policyDao().replace(PolicyEntity(version = 14, json = "{\"version\":14}"))
        db.openHelper.writableDatabase.execSQL(
            "INSERT INTO command_acks (commandId, status, detail, enqueuedAt) VALUES ('fixture-command', 'acked', NULL, 100)"
        )
    }

    private suspend fun assertMigrationRows() {
        assertEquals(PolicyEntity(version = 14, json = "{\"version\":14}"), db.policyDao().get())
        db.openHelper.readableDatabase.query(
            "SELECT status, detail, enqueuedAt FROM command_acks WHERE commandId = 'fixture-command'"
        ).use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("acked", cursor.getString(0))
            assertTrue(cursor.isNull(1))
            assertEquals(100L, cursor.getLong(2))
        }
    }

    private fun locationEvent() = Event(
        id = UUID.randomUUID().toString(), kind = EventKind.location,
        occurredAt = "2026-11-04T12:00:00Z", payload = JsonObject(emptyMap())
    )

    @Test
    fun savedLocationSurvivesAcceptanceReopenAndDuplicateRecord() = runBlocking {
        val event = locationEvent()
        LocationObservationStore(db) { 200L }.record(event, 100L)
        val original = requireNotNull(db.locationObservationDao().get())
        assertEquals(100L, original.sampleAt)
        assertEquals(200L, original.savedAt)
        EventQueue(db).markAccepted(listOf(event.id))
        db.close()
        db = openDatabase()
        LocationObservationStore(db) { 300L }.record(event, 100L)
        assertEquals(original, db.locationObservationDao().get())
        assertEquals(0, EventQueue(db).size())
    }

    @Test
    fun failedLocationMetadataWriteRollsBackEventAndCanRetry() = runBlocking {
        val event = locationEvent()
        db.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER reject_observation BEFORE INSERT ON location_observation BEGIN SELECT RAISE(ABORT, 'test failure'); END"
        )
        try {
            LocationObservationStore(db).record(event, 100L)
            fail("Expected metadata write failure")
        } catch (expected: android.database.sqlite.SQLiteException) {
            assertTrue(expected.message.orEmpty().contains("test failure"))
        }
        assertNull(db.locationObservationDao().get())
        assertEquals(0, EventQueue(db).size())
        db.openHelper.writableDatabase.execSQL("DROP TRIGGER reject_observation")
        LocationObservationStore(db).record(event, 100L)
        assertEquals(event.id, db.locationObservationDao().get()?.eventId)
        assertEquals(listOf(event), EventQueue(db).drainBatch())
    }

    @Test
    fun laterSaveDoesNotRewriteAnOlderProviderSampleTime() = runBlocking {
        LocationObservationStore(db) { 300L }.record(locationEvent(), 200L)
        val cachedEvent = locationEvent()
        LocationObservationStore(db) { 400L }.record(cachedEvent, 100L)
        val saved = requireNotNull(db.locationObservationDao().get())
        assertEquals(cachedEvent.id, saved.eventId)
        assertEquals(100L, saved.sampleAt)
        assertEquals(400L, saved.savedAt)
    }

    @Test
    fun sameProviderFixRedeliveredUnderNewIdIsNotQueuedTwice() = runBlocking {
        val first = locationEvent()
        LocationObservationStore(db) { 200L }.record(first, 100L)
        LocationObservationStore(db) { 300L }.record(locationEvent(), 100L)
        assertEquals(first.id, db.locationObservationDao().get()?.eventId)
        assertEquals(listOf(first), EventQueue(db).drainBatch())
    }

    @Test
    fun movingToAnotherAccountDiscardsUnsentDataAndReReportsBrokenProtections() = runBlocking {
        LocationObservationStore(db).record(locationEvent(), 100L)
        CommandAckQueue(db).enqueue(CommandAck("old-account-command", "acked"))
        tracker().observe("usage_access", false)
        assertTrue(EventQueue(db).size() > 0)

        PreviousAccountData(db).discard()

        assertEquals(0, EventQueue(db).size())
        assertTrue(CommandAckQueue(db).pending().isEmpty())
        assertNull(db.locationObservationDao().get())
        assertNull(db.healthStateDao().get("time-limit", "usage_access")?.healthy)

        tracker().observe("usage_access", false)
        val reported = EventQueue(db).drainBatch()
        assertEquals(1, reported.size)
        assertEquals(EventKind.enforcement, reported.single().kind)
    }

    @Test
    fun versionThreeMigrationPreservesHealthAndQueuedEvents() = runBlocking {
        seedMigrationRows()
        tracker().observe("usage_access", false)
        val original = EventQueue(db).drainBatch()
        db.close()
        SQLiteDatabase.openDatabase(context.getDatabasePath(databaseName).path, null,
            SQLiteDatabase.OPEN_READWRITE).use { legacy ->
            legacy.execSQL("DROP TABLE location_observation")
            legacy.version = 3
        }
        db = openDatabase()
        assertEquals(original, EventQueue(db).drainBatch())
        assertEquals(false, db.healthStateDao().get("time-limit", "usage_access")?.healthy)
        assertNull(db.locationObservationDao().get())
        assertEquals(4, db.openHelper.readableDatabase.version)
        assertMigrationRows()
    }

    @Test
    fun locationStatusReadsFixtureWithoutApplyingPolicyOrGeneratingEvents() = runBlocking {
        val policy = Policy(14, location = Policy.Location(enabled = true))
        val event = locationEvent()
        LocationObservationStore(db) { 200L }.record(event, 100L)
        val reader = CollectionStatusReader(context, db)
        val snapshot = reader.read(policy)
        assertEquals(LocationEnforcer.isLocationOn(context), snapshot.location.toggleOn)
        assertEquals(CollectionStatusSummary.SavedSample(100L, 200L), snapshot.location.lastSample)
        assertTrue(snapshot.location.historyKnown)
        assertTrue(CollectionStatusSummary.needsRefresh(policy))
        assertTrue(CollectionStatusSummary.describe(policy, snapshot.usage, snapshot.location)
            .contains("Historical location sample"))
        assertEquals(listOf(event), EventQueue(db).drainBatch())
        assertNull(db.policyDao().get())
        EventQueue(db).markAccepted(listOf(event.id))
        assertEquals(snapshot.location.lastSample, reader.read(policy).location.lastSample)
        assertEquals(0, EventQueue(db).size())
    }

    @Test
    fun failedLocationEnqueuePreservesPriorObservation() = runBlocking {
        LocationObservationStore(db).record(locationEvent(), 100L)
        val before = db.locationObservationDao().get()
        db.openHelper.writableDatabase.execSQL(
            "CREATE TRIGGER reject_location_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'test failure'); END"
        )
        try {
            LocationObservationStore(db).record(locationEvent(), 200L)
            fail("Expected event write failure")
        } catch (expected: android.database.sqlite.SQLiteException) {
            assertTrue(expected.message.orEmpty().contains("test failure"))
        }
        assertEquals(before, db.locationObservationDao().get())
        assertEquals(1, EventQueue(db).size())
    }
}
