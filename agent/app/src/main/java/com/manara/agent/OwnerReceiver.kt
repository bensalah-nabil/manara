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
 * [onEnabled] grants Manara's own permissions and starts push, the managed notice and the
 * periodic sync. Android calls it on every `set-device-owner` try, refused ones too: the shell
 * makes Manara an admin before asking for owner (and again for an admin that already exists,
 * DevicePolicyManagerService.setActiveAdmin). Nothing here may assume Manara is owner;
 * ManagedNoticeService checks for itself.
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
            // Location is no longer granted here: Android tells the child "Location access granted
            // to Manara" (Permission module AutoGrantPermissionsNotifier, android14/15-release) for
            // a feature the parent may never turn on. LocationEnforcer grants it when the parent
            // does (audit 2026-11-21).
            val permissions = buildList {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    add(android.Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            grant(context, permissions)
        }

        /** The location permissions, granted when the parent turns location sharing on. */
        fun grantLocationPermissions(context: Context) {
            grant(context, listOf(
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                android.Manifest.permission.ACCESS_COARSE_LOCATION,
                // After the foreground ones: background location is only granted on top of them.
                android.Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ))
        }

        private fun grant(context: Context, permissions: List<String>) {
            val dpm = context.getSystemService(DevicePolicyManager::class.java)
            val admin = ComponentName(context, OwnerReceiver::class.java)
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
