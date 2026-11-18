package com.manara.agent.update

import android.content.Context
import java.io.File

/**
 * The last offer from the server and how often installing it failed, kept on disk: the worker
 * runs in a later process than the sync that saw the offer, and an install kills the process.
 * Tries are counted per version, and start again at zero for a newer one.
 */
class UpdateStore(context: Context) {
    private val prefs = context.getSharedPreferences("agent_update", Context.MODE_PRIVATE)

    /** Where the download goes before it is checked; deleted once installed or refused. */
    val apkFile = File(context.noBackupFilesDir, "update.apk")

    fun save(offer: UpdateOffer?) {
        if (offer == null) {
            prefs.edit().clear().apply()
            return
        }
        val sameVersion = prefs.getInt(KEY_CODE, 0) == offer.versionCode
        prefs.edit()
            .putInt(KEY_CODE, offer.versionCode)
            .putString(KEY_NAME, offer.versionName)
            .putString(KEY_URL, offer.url)
            .putString(KEY_SHA, offer.sha256)
            .apply { if (!sameVersion) putInt(KEY_TRIES, 0) }
            .apply()
    }

    fun offer(): UpdateOffer? {
        val code = prefs.getInt(KEY_CODE, 0).takeIf { it > 0 } ?: return null
        return UpdateOffer(
            versionCode = code,
            versionName = prefs.getString(KEY_NAME, null) ?: return null,
            url = prefs.getString(KEY_URL, null) ?: return null,
            sha256 = prefs.getString(KEY_SHA, null) ?: return null,
        )
    }

    val failedTries: Int get() = prefs.getInt(KEY_TRIES, 0)

    fun recordFailure() {
        prefs.edit().putInt(KEY_TRIES, failedTries + 1).commit()
    }

    private companion object {
        const val KEY_CODE = "version_code"
        const val KEY_NAME = "version_name"
        const val KEY_URL = "url"
        const val KEY_SHA = "sha256"
        const val KEY_TRIES = "failed_tries"
    }
}
