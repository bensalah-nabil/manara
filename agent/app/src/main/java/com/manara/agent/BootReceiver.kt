package com.manara.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.manara.agent.push.PushManager
import com.manara.agent.sync.SyncWorker

/**
 * Restarts the visible managed-device notice after a reboot, and after Manara itself is
 * updated: an update stops the app, and on the SM-A045F nothing brought the notice back
 * until someone opened Manara. A Play update would do the same on every phone.
 *
 * Both broadcasts may start a foreground service from the background (developer.android.com,
 * "Restrictions on starting a foreground service from the background": ACTION_BOOT_COMPLETED
 * and ACTION_MY_PACKAGE_REPLACED are listed exemptions, and so are device owners).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in RESTART_ACTIONS) {
            // A released phone is an ordinary app: no managed notice, no syncing.
            val dpm = context.getSystemService(android.app.admin.DevicePolicyManager::class.java)
            if (!dpm.isDeviceOwnerApp(context.packageName)) {
                // A notice left behind by an earlier release is cleared on the next update or restart.
                ManagedNoticeService.dismiss(context)
                return
            }
            ManagedNoticeService.start(context)
            PushManager.ensureRegistered(context)
            // Belt-and-suspenders: WorkManager persists periodic work across
            // reboots on its own, but re-enqueuing here is idempotent (KEEP
            // policy) and costs nothing, consistent with architecture.md's
            // "resilient" design goal over trusting a single code path.
            SyncWorker.schedule(context)
            // One sync now, not in 15 minutes: it also finishes a release that was cut off,
            // which is what an update or a restart may have interrupted.
            SyncWorker.enqueueOneTime(context)
            // Restarted during guided setup's reconnect step: keep watching for the accounts.
            com.manara.agent.setup.SetupService.resume(context)
        }
    }

    companion object {
        val RESTART_ACTIONS = setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)
    }
}
