package com.manara.agent.sync

import android.content.Context

/**
 * Stores the device's bearer token from `/enroll`. Encrypted at rest via
 * [SecureTokenCipher] (Android Keystore AES-GCM) — resolved at
 * implementation time per `docs/phase1-plan.md` §8, since
 * `EncryptedSharedPreferences` is deprecated upstream with nothing shipped
 * in its place. The device id itself isn't a credential, so it stays
 * plain — only the bearer token is encrypted.
 */
class DeviceTokenStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun deviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)

    fun deviceToken(): String? =
        prefs.getString(KEY_TOKEN, null)?.let { SecureTokenCipher.decrypt(it) }

    fun save(deviceId: String, deviceToken: String) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_TOKEN, SecureTokenCipher.encrypt(deviceToken))
            .apply()
    }

    /** The secret a parent's offline release code is checked against; encrypted like the token. */
    fun releaseSecret(): ByteArray? =
        prefs.getString(KEY_RELEASE_SECRET, null)?.let { SecureTokenCipher.decrypt(it) }
            ?.let { android.util.Base64.decode(it, android.util.Base64.NO_WRAP) }

    /** [base64] exactly as the server sent it. */
    fun saveReleaseSecret(base64: String) {
        prefs.edit().putString(KEY_RELEASE_SECRET, SecureTokenCipher.encrypt(base64)).apply()
    }

    fun clear() = prefs.edit().clear().commit()

    companion object {
        private const val PREFS_NAME = "device_token_store"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_TOKEN = "device_token"
        private const val KEY_RELEASE_SECRET = "release_secret"
    }
}
