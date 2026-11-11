package com.manara.agent.setup

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.util.Log

/** Reads what [SetupReadiness] decides on. Each read is cheap, so the setup screen polls it. */
class SetupReadinessReader(private val context: Context) {

    fun read(): SetupReadiness.Snapshot {
        val battery = runCatching { context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) }.getOrNull()
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return SetupReadiness.Snapshot(
            sdkInt = Build.VERSION.SDK_INT,
            wifi = onWifi(),
            batteryPercent = if (level >= 0 && scale > 0) level * 100 / scale else null,
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL,
            developerOptions = globalFlag(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED),
            wirelessDebugging = globalFlag(ADB_WIFI_ENABLED),
        )
    }

    private fun onWifi(): Boolean? = runCatching {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        manager.getNetworkCapabilities(manager.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }.onFailure { Log.w(TAG, "cannot read the network", it) }.getOrNull()

    /** Null when the phone refuses the read: a maker may restrict a setting stock Android allows. */
    private fun globalFlag(name: String): Boolean? = runCatching {
        Settings.Global.getInt(context.contentResolver, name, 0) == 1
    }.onFailure { Log.w(TAG, "cannot read $name", it) }.getOrNull()

    private companion object {
        const val TAG = "ManaraSetupReady"
        /** `Settings.Global.ADB_WIFI_ENABLED`, `@hide` but `@Readable` (AOSP android15-release). */
        const val ADB_WIFI_ENABLED = "adb_wifi_enabled"
    }
}
