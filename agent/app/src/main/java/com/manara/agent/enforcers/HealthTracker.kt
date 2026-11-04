package com.manara.agent.enforcers

import android.content.Context
import android.content.SharedPreferences
import androidx.room.withTransaction
import com.manara.agent.events.EventQueue
import com.manara.agent.events.enforcementEvent
import com.manara.agent.storage.HealthStateEntity
import com.manara.agent.storage.ManaraDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

/**
 * Turns a health check that runs on every sync into one `enforcement` event
 * per change. State and event commit in one Room transaction, serialized
 * across instances. The synchronous PolicyEnforcer API waits for this short
 * database operation on the IO dispatcher before returning.
 */
class HealthTracker(
    private val db: ManaraDatabase,
    private val prefs: SharedPreferences,
    private val enforcerId: String
) {
    constructor(context: Context, prefs: SharedPreferences, enforcerId: String) :
        this(ManaraDatabase.get(context), prefs, enforcerId)

    private val eventQueue = EventQueue(db)

    enum class Change { BROKE, RESTORED, NONE }

    fun observe(check: String, healthy: Boolean) {
        runBlocking(Dispatchers.IO) {
            db.withTransaction {
                val stored = db.healthStateDao().get(enforcerId, check)
                val key = KEY_PREFIX + check
                val previous = if (stored != null) stored.healthy
                    else if (prefs.contains(key)) prefs.getBoolean(key, true) else null
                val event = when (change(previous, healthy)) {
                    Change.BROKE -> enforcementEvent(enforcerId, "missing", check)
                    Change.RESTORED -> enforcementEvent(enforcerId, "restored", check)
                    Change.NONE -> null
                }
                db.healthStateDao().put(HealthStateEntity(enforcerId, check, healthy))
                event?.let { eventQueue.enqueue(it) }
            }
        }
    }

    /** Call when the feature is off, so re-enabling it starts from a clean slate. */
    fun forget(check: String) {
        runBlocking(Dispatchers.IO) {
            db.healthStateDao().put(HealthStateEntity(enforcerId, check, null))
        }
    }

    companion object {
        private const val KEY_PREFIX = "health_"

        /** `previous == null` is the first observation: unhealthy then is still worth reporting. */
        fun change(previous: Boolean?, healthy: Boolean): Change = when {
            !healthy && previous != false -> Change.BROKE
            healthy && previous == false -> Change.RESTORED
            else -> Change.NONE
        }
    }
}
