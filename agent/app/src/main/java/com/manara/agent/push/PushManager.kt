package com.manara.agent.push

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.manara.agent.sync.PushTokenStore

/**
 * Entry point called from the same places `OwnerReceiver.grantSelfGrantablePermissions`
 * is (onEnabled, BootReceiver, MainActivity.onCreate) -- idempotent, a
 * no-op when [PushConfig.isConfigured] is false, so calling it everywhere
 * is harmless on a build without a Firebase project set up.
 */
object PushManager {
    private const val TAG = "ManaraPush"

    fun ensureRegistered(context: Context) {
        if (!PushConfig.isConfigured) return
        PushConfig.ensureFirebaseInitialized(context)

        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> PushTokenStore(context).save(token) }
            .addOnFailureListener { e -> Log.w(TAG, "could not fetch FCM token", e) }
    }
}
