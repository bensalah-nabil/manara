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
        registry.applyAll(Policy(version = 0))
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
        Log.i(TAG, "Released: Manara no longer manages this phone")
    }

    companion object {
        private const val TAG = "ManaraRelease"
    }
}
