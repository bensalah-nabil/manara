package com.manara.agent.location

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.util.Log
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.manara.agent.R
import com.manara.agent.storage.ManaraDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Pure. Location requests are dropped at every reboot and must not be renewed
 * at every sync (that restarts the interval), so ask again only when needed.
 */
object LocationRequestDecision {
    data class Applied(val intervalMinutes: Int, val bootCount: Int)

    fun needsRequest(applied: Applied?, intervalMinutes: Int, bootCount: Int): Boolean =
        applied == null || applied.intervalMinutes != intervalMinutes || applied.bootCount != bootCount
}

/**
 * Location sharing the parent turned on: fixes are delivered to
 * [LocationUpdatesReceiver] in the background (ACCESS_BACKGROUND_LOCATION,
 * granted by the device owner itself), and a distinct notice shows the whole
 * time, apart from the managed notice: knowing location specifically is read
 * is different from knowing the phone is managed (ADR-0001). A device owner's
 * ongoing notice can't be swiped away (Android 14 exempts DPCs).
 */
object LocationSharing {
    private const val TAG = "ManaraLocation"
    private const val CHANNEL_ID = "manara_location_notice"
    private const val NOTIFICATION_ID = 1002
    private const val PREFS = "location_sharing"

    fun hasPermissions(context: Context): Boolean =
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_BACKGROUND_LOCATION).all {
            context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
        }

    /** Idempotent. Fails closed: no permission, no request and no notice claiming otherwise. */
    fun start(context: Context, intervalMinutes: Int) {
        // The grant otherwise ran only at setup and when Manara was opened. On the SM-A528B
        // background location stayed denied for days, so turning sharing on from the console did
        // nothing until someone opened the app (2026-11-09).
        if (!hasPermissions(context)) com.manara.agent.OwnerReceiver.grantSelfGrantablePermissions(context)
        if (!hasPermissions(context)) {
            Log.w(TAG, "Location permissions missing; not sharing")
            stop(context)
            return
        }
        showNotice(context, intervalMinutes)
        val bootCount = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 0)
        if (!LocationRequestDecision.needsRequest(applied(context), intervalMinutes, bootCount)) return
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, intervalMinutes * 60_000L).build()
        try {
            LocationServices.getFusedLocationProviderClient(context).requestLocationUpdates(request, pendingIntent(context))
                .addOnSuccessListener { save(context, LocationRequestDecision.Applied(intervalMinutes, bootCount)) }
                .addOnFailureListener { Log.w(TAG, "Location request refused", it) }
        } catch (denied: SecurityException) {
            Log.w(TAG, "Location request denied", denied)
        }
    }

    fun stop(context: Context) {
        runCatching { LocationServices.getFusedLocationProviderClient(context).removeLocationUpdates(pendingIntent(context)) }
            .onFailure { Log.w(TAG, "removeLocationUpdates failed", it) }
        context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun applied(context: Context): LocationRequestDecision.Applied? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.contains("interval")) return null
        return LocationRequestDecision.Applied(prefs.getInt("interval", 0), prefs.getInt("boot", -1))
    }

    private fun save(context: Context, applied: LocationRequestDecision.Applied) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt("interval", applied.intervalMinutes).putInt("boot", applied.bootCount).apply()
    }

    /** Mutable: the location provider adds the fix to it. */
    private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 0, Intent(context, LocationUpdatesReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )

    private fun showNotice(context: Context, intervalMinutes: Int) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Location sharing", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows that this phone's location is shared with your parent."
                setShowBadge(false)
            }
        )
        val notice = Notification.Builder(context, CHANNEL_ID)
            .setContentTitle("Your location is shared")
            .setContentText("Your parent sees where this phone is, every $intervalMinutes minutes.")
            .setSmallIcon(R.drawable.ic_stat_manara)
            .setOngoing(true)
            .build()
        manager.notify(NOTIFICATION_ID, notice)
    }
}

/** Receives fixes from the location provider and saves each as a location event. */
class LocationUpdatesReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val location = LocationResult.extractResult(intent)?.lastLocation ?: return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                LocationObservationStore(ManaraDatabase.get(context.applicationContext)).record(
                    LocationFixEvent.build(
                        id = UUID.randomUUID().toString(),
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracyMeters = location.accuracy,
                        fixTimeMillis = location.time,
                        nowMillis = System.currentTimeMillis(),
                    ),
                    sampleAt = location.time,
                )
            } catch (error: Exception) {
                Log.w("ManaraLocation", "Cannot persist location sample", error)
            } finally {
                pending.finish()
            }
        }
    }
}
