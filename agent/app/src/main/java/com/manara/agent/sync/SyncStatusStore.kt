package com.manara.agent.sync

import android.content.Context

/** When the phone last reached its parent's server, for the child's screen. */
class SyncStatusStore(context: Context) {
    private val prefs = context.getSharedPreferences("sync_status", Context.MODE_PRIVATE)

    fun lastSuccessAt(): Long? = prefs.getLong(KEY_LAST_SUCCESS, 0L).takeIf { it > 0L }

    fun recordSuccess(atMillis: Long) {
        prefs.edit().putLong(KEY_LAST_SUCCESS, atMillis).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_LAST_SUCCESS = "last_success_at"
    }
}
