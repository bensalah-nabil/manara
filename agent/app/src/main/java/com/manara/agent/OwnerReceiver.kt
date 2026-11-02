package com.manara.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

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
        ManagedNoticeService.start(context)
    }
}
