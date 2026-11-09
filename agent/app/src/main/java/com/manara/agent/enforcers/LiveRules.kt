package com.manara.agent.enforcers

import android.content.Context
import android.os.PowerManager
import android.util.Log
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * Re-checks the rules that must take effect while the phone is in use, every minute with the screen
 * on. `SyncWorker` runs at most every 15 minutes, too slow for a daily limit, a new browser or a
 * bedtime: without this, unlocking during a lock window left the phone usable until the next run. It
 * stays as the backstop if this process is killed. Works from the cached policy, with no network.
 */
class LiveRules(context: Context) {
    private val appContext = context.applicationContext
    private val power = appContext.getSystemService(PowerManager::class.java)
    private val registry = liveEnforcerRegistry(appContext)

    suspend fun run() {
        val database = ManaraDatabase.get(appContext)
        val cache = PolicyCache(database)
        val queue = EventQueue(database)
        while (true) {
            delay(INTERVAL_MILLIS)
            // Never let a failed check take the managed notice's service down with it.
            try {
                if (power.isInteractive) {
                    cache.current()?.let { registry.applyAll(it) }
                    val events = registry.collectAllEvents()
                    events.forEach { queue.enqueue(it) }
                    // A call is the one event a parent may be waiting for, so send it now.
                    if (events.any { it.kind == com.manara.agent.events.EventKind.call }) {
                        com.manara.agent.sync.SyncWorker.enqueueOneTime(appContext)
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "Live rule check failed", error)
            }
        }
    }

    private companion object {
        const val TAG = "ManaraLiveRules"
        const val INTERVAL_MILLIS = 60_000L
    }
}
