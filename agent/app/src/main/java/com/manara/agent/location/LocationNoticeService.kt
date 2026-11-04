package com.manara.agent.location

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.storage.ManaraDatabase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * The visible foreground service behind `LocationEnforcer`. ADR-0001
 * twice over, not once: a **distinct** notification, not folded into the
 * generic "device managed" one — knowing location specifically is being
 * read is different information than knowing the device is managed at all
 * (architecture.md §6: "the person being monitored can always see what is
 * being collected"); and separately, Android itself requires a visible
 * foreground service of type `location` to read location without also
 * needing `ACCESS_BACKGROUND_LOCATION`.
 */
class LocationNoticeService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { recordFix(it) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val intervalMinutes = intent?.getIntExtra(EXTRA_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
            ?: DEFAULT_INTERVAL_MINUTES
        startLocationUpdates(intervalMinutes)
        return START_STICKY
    }

    override fun onDestroy() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startLocationUpdates(intervalMinutes: Int) {
        // Fails closed, same philosophy as TimeLimitEnforcer without Usage
        // Access -- OwnerReceiver self-grants this at onEnabled(), but
        // check anyway rather than assume it always landed.
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        fusedLocationClient.removeLocationUpdates(locationCallback)
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            intervalMinutes * 60_000L
        ).build()
        fusedLocationClient.requestLocationUpdates(request, locationCallback, mainLooper)
    }

    private fun recordFix(location: Location) {
        scope.launch {
            try {
                val db = ManaraDatabase.get(applicationContext)
                LocationObservationStore(db).record(
                    Event(
                        id = UUID.randomUUID().toString(),
                        kind = EventKind.location,
                        occurredAt = Instant.now().toString(),
                        payload = JsonObject(
                            mapOf(
                                "lat" to JsonPrimitive(location.latitude),
                                "lng" to JsonPrimitive(location.longitude),
                                "accuracyMeters" to JsonPrimitive(location.accuracy)
                            )
                        )
                    ),
                    sampleAt = location.time
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w("ManaraLocation", "Cannot persist location sample", error)
            }
        }
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Location sharing", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows that this device's location is being shared, per policy."
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("Location is being shared")
            .setContentText("This device's location is shared per the current policy.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "manara_location_notice"
        private const val NOTIFICATION_ID = 1002 // distinct from ManagedNoticeService's 1001
        private const val EXTRA_INTERVAL_MINUTES = "interval_minutes"
        private const val DEFAULT_INTERVAL_MINUTES = 15

        fun start(context: Context, intervalMinutes: Int) {
            val intent = Intent(context, LocationNoticeService::class.java)
                .putExtra(EXTRA_INTERVAL_MINUTES, intervalMinutes)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LocationNoticeService::class.java))
        }
    }
}
