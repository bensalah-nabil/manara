package com.manara.agent.enforcers

import android.content.Context
import android.location.LocationManager
import com.manara.agent.OwnerReceiver
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
            // Granted only now, when the parent turns it on: granting it at setup showed the child
            // "Location access granted to Manara" for a feature that was off (audit 2026-11-21).
            if (!LocationSharing.hasPermissions(context)) OwnerReceiver.grantLocationPermissions(context)
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
            return manager.isLocationEnabled
        }

        private const val PREFS_NAME = "location_enforcer"
        private const val CHECK_LOCATION_ON = "device_location_on"
        private const val CHECK_PERMISSION = "location_permission"
    }
}
