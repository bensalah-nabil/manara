package com.manara.agent.sync

import android.content.Context

/**
 * Stores the device's current FCM registration token. Plain
 * `SharedPreferences`, not encrypted like [DeviceTokenStore] -- a push
 * token is a routing address, not a credential; by itself it grants no
 * access to anything (sending to it requires this project's own Firebase
 * service-account key, which lives only on the backend).
 */
class PushTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun current(): String? = prefs.getString(KEY_TOKEN, null)

    fun save(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    companion object {
        private const val PREFS_NAME = "push_token_store"
        private const val KEY_TOKEN = "fcm_token"
    }
}
