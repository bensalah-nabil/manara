package com.manara.agent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import com.manara.agent.push.PushManager
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
        grantSelfGrantablePermissions(context)
        PushManager.ensureRegistered(context)
        ManagedNoticeService.start(context)
        // Phase 1 step 5's one open gap: without this, enforcement only ever
        // re-ran when something manually called apply() (Enroll/Sync button
        // taps) -- found directly from testing, not assumed. enqueueUniquePeriodicWork's
        // KEEP policy makes this idempotent, so calling it again elsewhere
        // (BootReceiver) is harmless.
        SyncWorker.schedule(context)
    }

    companion object {
        /**
         * Grants every runtime permission the agent can self-grant as
         * device owner, so none of them depend on a prompt a parent could
         * miss or deny. Called from [onEnabled] (real enrollment) and
         * again from `MainActivity.onCreate()` — idempotent, and the only
         * way an already-enrolled phone (admin activated before a given
         * permission's grant call existed) actually gets it, short of a
         * fresh enrollment. `PACKAGE_USAGE_STATS` is deliberately not
         * here — it's AppOps-backed, not a runtime permission, and has no
         * device-owner silent-grant API at all (see `TimeLimitEnforcer`).
         */
        fun grantSelfGrantablePermissions(context: Context) {
            val dpm = context.getSystemService(DevicePolicyManager::class.java)
            val admin = ComponentName(context, OwnerReceiver::class.java)
            val permissions = buildList {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    add(android.Manifest.permission.POST_NOTIFICATIONS)
                }
                add(android.Manifest.permission.ACCESS_FINE_LOCATION)
                add(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                // After the foreground ones: background location is only granted on top of them.
                add(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
            // From target API 35, a sensor permission the owner may not grant throws instead of
            // returning quietly (AOSP THROW_SECURITY_EXCEPTION_FOR_SENSOR_PERMISSIONS). Guided
            // setup sets the owner over adb, which allows it; a failure here is logged, never fatal,
            // and shows up as a missing permission in the location health check.
            for (permission in permissions) {
                runCatching {
                    dpm.setPermissionGrantState(admin, context.packageName, permission, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
                }.onSuccess { granted ->
                    if (!granted) android.util.Log.w("ManaraOwner", "Not granted: $permission")
                }.onFailure { android.util.Log.w("ManaraOwner", "Cannot grant $permission", it) }
            }
        }
    }
}
