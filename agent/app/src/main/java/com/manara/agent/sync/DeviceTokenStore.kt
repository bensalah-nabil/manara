package com.manara.agent.sync

import android.content.Context

/**
 * Stores the device's bearer token from `/enroll`. Deliberately plain
 * `SharedPreferences` for now, NOT encrypted — a known gap, not an
 * oversight (see `docs/phase1-plan.md` §8). Revisit with proper secure
 * storage before this agent handles a real device token for real.
 */
class DeviceTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun deviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)
    fun deviceToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun save(deviceId: String, deviceToken: String) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_TOKEN, deviceToken)
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val PREFS_NAME = "device_token_store"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_TOKEN = "device_token"
    }
}
