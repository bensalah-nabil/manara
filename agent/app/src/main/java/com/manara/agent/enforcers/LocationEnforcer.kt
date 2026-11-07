package com.manara.agent.enforcers

import android.content.Context
import android.location.LocationManager
import android.os.Build
import com.manara.agent.events.Event
import com.manara.agent.location.LocationSharing
import com.manara.agent.policy.Policy

/**
 * architecture.md §2.2: location sharing with its own visible notice
 * (ADR-0001; see [LocationSharing]). This class starts or stops it from the
 * policy and reports when the phone can't share: Location turned off, or the
 * permissions missing.
 *
 * With the device-wide Location toggle off, no fixes were produced on the
 * test phone even with ACCESS_FINE_LOCATION granted. This enforcer reports
 * the toggle state; it does not change it. DevicePolicyManager does expose
 * setLocationEnabled for device owners from API 30 (Android reference).
 */
class LocationEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "location"

    private val health = HealthTracker(context, context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE), id)

    override fun apply(policy: Policy) {
        if (policy.location.enabled) {
            LocationSharing.start(context, intervalMinutes = policy.location.intervalMinutes)
            health.observe(CHECK_LOCATION_ON, isLocationOn(context) ?: false)
            health.observe(CHECK_PERMISSION, LocationSharing.hasPermissions(context))
        } else {
            LocationSharing.stop(context)
            health.forget(CHECK_LOCATION_ON)
            health.forget(CHECK_PERMISSION)
        }
    }

    override fun collectEvents(): List<Event> = emptyList()

    companion object {
        internal fun isLocationOn(context: Context): Boolean? {
            val manager = context.getSystemService(LocationManager::class.java) ?: return null
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                manager.isLocationEnabled
            } else {
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            }
        }

        private const val PREFS_NAME = "location_enforcer"
        private const val CHECK_LOCATION_ON = "device_location_on"
        private const val CHECK_PERMISSION = "location_permission"
    }
}
