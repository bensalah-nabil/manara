package com.manara.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.manara.agent.push.PushManager
import com.manara.agent.sync.SyncWorker

/**
 * Restarts the visible managed-device notice after a reboot.
 *
 * Phase 0 survival test: the notice must come back on its own after the phone
 * is restarted, without the user opening the app. Manufacturer background
 * limits (Xiaomi, Samsung, ...) are exactly what this is probing.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ManagedNoticeService.start(context)
            PushManager.ensureRegistered(context)
            // Belt-and-suspenders: WorkManager persists periodic work across
            // reboots on its own, but re-enqueuing here is idempotent (KEEP
            // policy) and costs nothing, consistent with architecture.md's
            // "resilient" design goal over trusting a single code path.
            SyncWorker.schedule(context)
        }
    }
}
