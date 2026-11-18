package com.manara.agent.update

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.manara.agent.BuildConfig
import com.manara.agent.release.ReleaseProgress
import com.manara.agent.setup.ReconnectMarker
import com.manara.agent.setup.SetupService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Downloads the offered version, checks it is exactly that file, and installs it as device owner,
 * with no prompt. Runs only on Wi-Fi (unmetered) while charging, so usually at night, and never
 * during guided setup or a release ([UpdateDecision.reasonToWait]).
 */
class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val context = applicationContext
        val store = UpdateStore(context)
        val offer = store.offer()
        val reason = UpdateDecision.reasonToWait(
            offer = offer,
            installedVersionCode = BuildConfig.VERSION_CODE,
            selfUpdateBuild = AgentUpdates.SELF_UPDATE,
            deviceOwner = context.getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName),
            setupRunning = SetupService.isActive || ReconnectMarker.Store(context).load() != null,
            releasing = ReleaseProgress(context).releasing,
            failedTries = store.failedTries,
        )
        if (reason != null || offer == null) {
            Log.i(TAG, "no update: $reason")
            return@withContext Result.success()
        }

        try {
            val sha256 = download(offer.url, store.apkFile)
            val archive = context.packageManager.getPackageArchiveInfo(store.apkFile.path, 0)
            val problem = UpdateDecision.problemWithDownload(
                offer, sha256, archive?.packageName, archive?.longVersionCode, context.packageName,
            )
            if (problem != null) return@withContext failed(store, "refused ${offer.versionName}: $problem")
            Log.i(TAG, "installing ${offer.versionName} (${offer.versionCode}) over ${BuildConfig.VERSION_NAME}")
            install(context, store.apkFile)
            // Android replaces the app and restarts it (BootReceiver handles MY_PACKAGE_REPLACED);
            // UpdateResultReceiver records a failure.
            Result.success()
        } catch (e: IOException) {
            failed(store, "download of ${offer.versionName} failed: $e")
        } catch (e: SecurityException) {
            failed(store, "install of ${offer.versionName} refused: $e")
        }
    }

    private fun failed(store: UpdateStore, message: String): Result {
        Log.w(TAG, message)
        store.apkFile.delete()
        store.recordFailure()
        return if (store.failedTries < UpdateDecision.MAX_TRIES) Result.retry() else Result.failure()
    }

    /** Writes the file and returns its SHA-256 in lowercase hex. */
    private fun download(url: String, target: File): String {
        val client = OkHttpClient.Builder().callTimeout(10, TimeUnit.MINUTES).build()
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            val body = response.body ?: throw IOException("empty response")
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            target.outputStream().use { out ->
                body.byteStream().use { input ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > MAX_BYTES) throw IOException("file larger than $MAX_BYTES bytes")
                        digest.update(buffer, 0, read)
                        out.write(buffer, 0, read)
                    }
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }

    private fun install(context: Context, apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("manara.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val result = PendingIntent.getBroadcast(
                context, sessionId, Intent(context, UpdateResultReceiver::class.java),
                // Mutable: the installer adds the status extras to this intent.
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(result.intentSender)
        }
    }

    companion object {
        const val TAG = "ManaraUpdate"
        private const val WORK_NAME = "manara-update"
        private const val MAX_BYTES = 50L * 1024 * 1024

        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<UpdateWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.UNMETERED)
                        .setRequiresCharging(true)
                        .setRequiresBatteryNotLow(true)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
