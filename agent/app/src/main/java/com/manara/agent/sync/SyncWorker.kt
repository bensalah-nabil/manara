package com.manara.agent.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.enforcers.TimeLimitEnforcer
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
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): WorkResult {
        val db = ManaraDatabase.get(applicationContext)
        val registry = EnforcerRegistry(listOf(TimeLimitEnforcer(applicationContext)))
        val syncManager = SyncManager(
            api = ManaraApiFactory.create(),
            policyCache = PolicyCache(db),
            eventQueue = EventQueue(db),
            enforcerRegistry = registry,
            tokenStore = DeviceTokenStore(applicationContext)
        )

        return when (syncManager.sync()) {
            is SyncManager.Result.Success -> WorkResult.success()
            is SyncManager.Result.NotEnrolled -> WorkResult.success() // nothing to sync yet, not a failure
            is SyncManager.Result.Unauthorized -> WorkResult.failure() // needs re-enrollment, retrying won't help
            is SyncManager.Result.Failed -> {
                if (runAttemptCount < MAX_RETRIES) WorkResult.retry() else WorkResult.failure()
            }
        }
    }

    companion object {
        private const val WORK_NAME = "manara-sync"
        private const val MAX_RETRIES = 5

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
