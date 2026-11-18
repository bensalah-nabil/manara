package com.manara.agent.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * The installer's answer to [UpdateWorker]'s session. A success usually never arrives here, since
 * the new version replaces this process. If Android asks for a confirmation (it shouldn't for a
 * device owner), the session is abandoned: the child is never asked to approve an update.
 */
class UpdateResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val store = UpdateStore(context)
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> Log.i(UpdateWorker.TAG, "update installed")
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                Log.w(UpdateWorker.TAG, "Android asked to confirm the update; not shown, session abandoned")
                val sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)
                if (sessionId >= 0) {
                    runCatching { context.packageManager.packageInstaller.abandonSession(sessionId) }
                        .onFailure { Log.w(UpdateWorker.TAG, "abandon session $sessionId", it) }
                }
                store.recordFailure()
            }
            else -> {
                Log.w(UpdateWorker.TAG, "update failed: status $status, $message")
                store.recordFailure()
            }
        }
        store.apkFile.delete()
    }
}
