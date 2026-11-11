package com.manara.agent.release

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.util.Log
import com.manara.agent.ManagedNoticeService
import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.enroll.PreviousAccountData
import com.manara.agent.location.LocationSharing
import com.manara.agent.policy.Policy
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.SyncWorker

/** Wrong release codes and an open move, kept across restarts. */
class ReleaseStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    val failures: Int get() = prefs.getInt(KEY_FAILURES, 0)
    val lastFailureAt: Long get() = prefs.getLong(KEY_LAST_FAILURE, 0L)

    fun recordFailure(nowMillis: Long) {
        prefs.edit().putInt(KEY_FAILURES, failures + 1).putLong(KEY_LAST_FAILURE, nowMillis).commit()
    }

    fun resetFailures() {
        prefs.edit().remove(KEY_FAILURES).remove(KEY_LAST_FAILURE).commit()
    }

    /** Until when a move is open, or null. */
    val transferUntil: Long? get() = prefs.getLong(KEY_TRANSFER_UNTIL, 0L).takeIf { it > 0L }

    /** The parent's release command behind the open move; null when opened with a code. */
    val transferCommandId: String? get() = prefs.getString(KEY_TRANSFER_COMMAND, null)

    fun openTransfer(commandId: String?, untilMillis: Long) {
        prefs.edit().putLong(KEY_TRANSFER_UNTIL, untilMillis).putString(KEY_TRANSFER_COMMAND, commandId).commit()
    }

    fun closeTransfer() {
        prefs.edit().remove(KEY_TRANSFER_UNTIL).remove(KEY_TRANSFER_COMMAND).commit()
    }

    fun clear() {
        prefs.edit().clear().commit()
    }

    companion object {
        private const val PREFS_NAME = "release_store"
        private const val KEY_FAILURES = "failures"
        private const val KEY_LAST_FAILURE = "last_failure_at"
        private const val KEY_TRANSFER_UNTIL = "transfer_until"
        private const val KEY_TRANSFER_COMMAND = "transfer_command"
    }
}

/**
 * Marks a release in progress, in its own file so [ReleaseStore.clear] can't erase it before the
 * phone has actually let go. Written with commit(), before anything changes.
 */
class ReleaseProgress(context: Context) {
    private val prefs = context.getSharedPreferences("release_progress", Context.MODE_PRIVATE)

    val releasing: Boolean get() = prefs.getBoolean(KEY_RELEASING, false)

    fun start() {
        prefs.edit().putBoolean(KEY_RELEASING, true).commit()
    }

    fun finish() {
        prefs.edit().clear().commit()
    }

    private companion object {
        const val KEY_RELEASING = "releasing"
    }
}

/**
 * Carries out a parent's release. The decisions (is a code right, is a move
 * open) are in [ReleaseCode], [ReleaseAttempts] and [TransferWindow]; this
 * only does the Android side.
 */
class Releaser(
    private val context: Context,
    private val db: ManaraDatabase,
    private val registry: EnforcerRegistry,
    private val tokenStore: DeviceTokenStore,
    private val releaseStore: ReleaseStore,
    private val now: () -> Long = System::currentTimeMillis
) {
    private val progress = ReleaseProgress(context)

    sealed class CodeResult {
        data object Accepted : CodeResult()
        data object Wrong : CodeResult()
        data class Locked(val untilMillis: Long) : CodeResult()
        /** The phone hasn't received its secret yet; it needs to connect once. */
        data object NoSecret : CodeResult()
    }

    /** Checks a parent's offline release code, counting wrong ones. */
    fun checkCode(typed: String): CodeResult {
        val at = now()
        ReleaseAttempts.lockedUntil(releaseStore.failures, releaseStore.lastFailureAt, at)?.let { return CodeResult.Locked(it) }
        val secret = tokenStore.releaseSecret() ?: return CodeResult.NoSecret
        if (!ReleaseCode.matches(secret, typed, at)) {
            releaseStore.recordFailure(at)
            return ReleaseAttempts.lockedUntil(releaseStore.failures, at, at)?.let { CodeResult.Locked(it) } ?: CodeResult.Wrong
        }
        releaseStore.resetFailures()
        return CodeResult.Accepted
    }

    /** Lets the phone take one new connection code for [TransferWindow.LENGTH_MILLIS]; nothing else changes yet. */
    fun openTransfer(commandId: String?) {
        releaseStore.openTransfer(commandId, now() + TransferWindow.LENGTH_MILLIS)
    }

    /**
     * Lifts every rule, forgets the account, and stops managing the phone.
     * Rules go first: undoing an app suspension or Private DNS needs the
     * device-owner rights this ends with. Clearing the owner also clears the
     * user restrictions and locked permissions (AOSP `clearDeviceOwnerLocked`).
     */
    suspend fun removeManara() {
        progress.start()
        // Not "call-log": turning it off revokes Manara's own READ_CALL_LOG, and Android kills an app
        // whose permission is revoked, which stopped a real release halfway (ReleaseRecovery).
        // Clearing the owner below unlocks the permission instead (AOSP clearUserPoliciesLocked:
        // updatePermissionFlagsForAllApps(FLAG_PERMISSION_POLICY_FIXED, 0)).
        registry.applyAllExcept(Policy(version = 0), KEPT_UNTIL_OWNER_CLEARED)
        SyncWorker.cancel(context)
        LocationSharing.stop(context)
        PreviousAccountData(db).discard()
        db.policyDao().clear()
        tokenStore.clear()
        releaseStore.clear()
        com.manara.agent.sync.SyncStatusStore(context).clear()
        ManagedNoticeService.stop(context)
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        if (dpm.isDeviceOwnerApp(context.packageName)) {
            @Suppress("DEPRECATION") // The documented way for a device owner to give up management of the phone.
            dpm.clearDeviceOwnerApp(context.packageName)
        }
        // Last, once Manara is no longer the owner: a refresh of the notice racing the stop above
        // could otherwise post it again.
        ManagedNoticeService.dismiss(context)
        progress.finish()
        Log.i(TAG, "Released: Manara no longer manages this phone")
    }

    /**
     * Finishes a release that was cut off ([ReleaseRecovery]). [serverRefused]: the last sync
     * answered that the server no longer knows this phone. True when the phone was released now.
     */
    suspend fun finishIfInterrupted(serverRefused: Boolean): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val finish = ReleaseRecovery.shouldFinish(
            releasing = progress.releasing,
            deviceOwner = dpm.isDeviceOwnerApp(context.packageName),
            hasToken = tokenStore.deviceToken() != null,
            hasPolicy = com.manara.agent.policy.PolicyCache(db).current() != null,
            serverRefused = serverRefused,
        )
        if (!finish) return false
        Log.w(TAG, "Finishing a release that was cut off")
        removeManara()
        return true
    }

    companion object {
        private const val TAG = "ManaraRelease"
        /** Enforcers not run during release, see [removeManara]. */
        private val KEPT_UNTIL_OWNER_CLEARED = setOf("call-log")
    }
}
