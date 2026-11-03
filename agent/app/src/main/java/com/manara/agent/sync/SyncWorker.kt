package com.manara.agent.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import java.util.concurrent.TimeUnit
import androidx.work.ListenableWorker.Result as WorkResult

/**
 * Drives [SyncManager] on a schedule (architecture.md §2.1's sync manager).
 * 15 minutes is both `docs/phase1-plan.md`'s suggested interval and
 * `WorkManager`'s own enforced minimum for periodic work — can't be set
 * shorter even if a tighter loop were wanted later.
 *
 * Verified actually working as dispatched by `WorkManager` (not just
 * "should work") via a `OneTimeWorkRequest` from `MainActivity`'s test
 * harness — `adb shell cmd jobscheduler run -f` turned out to not
 * reliably invoke a `WorkManager`-backed `CoroutineWorker`'s [doWork], so
 * that command isn't a trustworthy way to force-test this specific class.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): WorkResult {
        val db = ManaraDatabase.get(applicationContext)
        val registry = defaultEnforcerRegistry(applicationContext)
        val policyCache = PolicyCache(db)
        val syncManager = SyncManager(
            api = ManaraApiFactory.create(),
            policyCache = policyCache,
            eventQueue = EventQueue(db),
            enforcerRegistry = registry,
            tokenStore = DeviceTokenStore(applicationContext)
        )

        val result = syncManager.sync()
        Log.i(TAG, "sync result: $result")

        // Re-apply the cached policy regardless of whether THIS sync
        // changed it, or even succeeded at all. Found directly from
        // testing: SyncManager only calls applyAll() when the server
        // reports policyChanged, but a lock schedule or a usage limit is
        // wall-clock-driven, not just policy-change-driven -- "it's 22:00
        // now" needs re-evaluating on a timer even if the policy text
        // hasn't moved since yesterday. Using the last-known-good cached
        // policy here also serves architecture.md's resilience goal:
        // enforcement keeps running with no network, using whatever was
        // last successfully synced.
        policyCache.current()?.let { registry.applyAll(it) }

        return when (result) {
            is SyncManager.Result.Success -> WorkResult.success()
            is SyncManager.Result.NotEnrolled -> WorkResult.success() // nothing to sync yet, not a failure
            is SyncManager.Result.Unauthorized -> WorkResult.failure() // needs re-enrollment, retrying won't help
            is SyncManager.Result.Failed -> {
                if (runAttemptCount < MAX_RETRIES) WorkResult.retry() else WorkResult.failure()
            }
        }
    }

    companion object {
        private const val TAG = "ManaraSyncWorker"
        private const val WORK_NAME = "manara-sync"
        private const val MAX_RETRIES = 5

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
