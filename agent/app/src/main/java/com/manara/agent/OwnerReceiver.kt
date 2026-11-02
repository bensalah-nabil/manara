package com.manara.agent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import com.manara.agent.sync.SyncWorker

/**
 * The device-admin component that holds the device-owner role.
 *
 * ADB targets this class by name:
 *   dpm set-device-owner com.manara.agent/.OwnerReceiver
 *
 * In Phase 0 it does almost nothing — becoming device owner at all is the whole
 * test. When enabled, it just starts the always-visible managed notice so the
 * device is honestly marked as managed from the moment it's under control.
 */
class OwnerReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        grantNotificationPermission(context)
        ManagedNoticeService.start(context)
        // Phase 1 step 5's one open gap: without this, enforcement only ever
        // re-ran when something manually called apply() (Enroll/Sync button
        // taps) -- found directly from testing, not assumed. enqueueUniquePeriodicWork's
        // KEEP policy makes this idempotent, so calling it again elsewhere
        // (BootReceiver) is harmless.
        SyncWorker.schedule(context)
    }

    /**
     * The managed notice (ADR-0001) must not depend on a runtime permission
     * prompt a parent could miss or deny — found the hard way in Phase 0
     * testing: POST_NOTIFICATIONS defaults to denied for a sideloaded app on
     * API 33+, which silently drops the foreground service's notification
     * with no error. As device owner we can grant our own permission
     * directly, so the notice is guaranteed from the moment the agent is
     * enabled rather than depending on anyone granting it by hand.
     */
    private fun grantNotificationPermission(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, OwnerReceiver::class.java)
        dpm.setPermissionGrantState(
            admin,
            context.packageName,
            android.Manifest.permission.POST_NOTIFICATIONS,
            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
        )
    }
}
