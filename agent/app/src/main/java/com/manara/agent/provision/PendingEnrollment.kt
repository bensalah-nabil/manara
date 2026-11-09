package com.manara.agent.provision

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.manara.agent.ManagedNoticeService
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.enroll.EnrollmentRepository
import com.manara.agent.enroll.PreviousAccountData
import com.manara.agent.policy.PolicyCache
import com.manara.agent.release.ReleaseStore
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.ManaraApiFactory
import com.manara.agent.sync.SyncWorker
import java.util.concurrent.TimeUnit

/**
 * The connection code from QR setup, kept in Manara's private storage only until the phone has
 * joined the parent's account (single use, and the server lets it expire within a day).
 */
class PendingEnrollment(context: Context) {
    private val prefs = context.getSharedPreferences("manara.pending_enrollment", Context.MODE_PRIVATE)

    fun save(token: String) = prefs.edit().putString(KEY, token).apply()
    fun token(): String? = prefs.getString(KEY, null)
    fun clear() = prefs.edit().remove(KEY).apply()

    private companion object { const val KEY = "token" }
}

/** Joins the parent's account with the saved code, retrying while the network isn't there yet. */
class PendingEnrollmentWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val pending = PendingEnrollment(applicationContext)
        val token = pending.token() ?: return Result.success()
        val db = ManaraDatabase.get(applicationContext)
        val result = EnrollmentRepository(
            api = ManaraApiFactory.create(),
            tokenStore = DeviceTokenStore(applicationContext),
            policyCache = PolicyCache(db),
            enforcerRegistry = defaultEnforcerRegistry(applicationContext),
            previousAccountData = PreviousAccountData(db),
            releaseStore = ReleaseStore(applicationContext),
        ).enroll(token)
        return when (result) {
            is EnrollmentRepository.Result.Success -> {
                pending.clear()
                ManagedNoticeService.start(applicationContext)
                SyncWorker.schedule(applicationContext)
                SyncWorker.enqueueOneTime(applicationContext)
                Result.success()
            }
            // A used or expired code won't work later either: the parent types a new one in Manara.
            is EnrollmentRepository.Result.Rejected, EnrollmentRepository.Result.NotAllowed -> {
                Log.w(TAG, "QR setup's connection code refused: $result")
                pending.clear()
                Result.failure()
            }
            is EnrollmentRepository.Result.Failed -> {
                Log.w(TAG, "QR setup couldn't reach the server yet", result.cause)
                if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
            }
        }
    }

    companion object {
        private const val TAG = "ManaraProvision"
        private const val NAME = "manara-qr-enrollment"
        /** With exponential backoff from 30 s, about a day of tries: the code's own lifetime. */
        const val MAX_ATTEMPTS = 12

        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<PendingEnrollmentWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NAME, ExistingWorkPolicy.KEEP, request)
        }
    }
}
