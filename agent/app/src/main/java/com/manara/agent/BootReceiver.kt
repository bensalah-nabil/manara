package com.manara.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

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
        }
    }
}
