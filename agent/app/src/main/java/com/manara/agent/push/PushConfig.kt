package com.manara.agent.push

import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.manara.agent.BuildConfig

/**
 * Firebase project identity, read from Gradle `BuildConfig` fields that
 * default to empty strings -- not from `google-services.json`/the Google
 * Services Gradle plugin. FCM-only needs four plain strings, not a whole
 * generated-resources pipeline, and this way the agent builds and runs
 * exactly as it did before push existed (polling only) when no Firebase
 * project has been configured yet, instead of refusing to build at all
 * over one optional, additive feature.
 *
 * To actually enable push: create a Firebase project (console.firebase.google.com),
 * add an Android app to it with this project's applicationId
 * (`com.manara.agent`), and copy its Web API key / App ID / Project ID /
 * Sender ID into `agent/local.properties` (already gitignored, same file
 * `sdk.dir` already lives in) as `FCM_API_KEY`, `FCM_APP_ID`,
 * `FCM_PROJECT_ID`, `FCM_SENDER_ID`. See `app/build.gradle.kts` for where
 * these get read.
 */
object PushConfig {
    val isConfigured: Boolean get() = BuildConfig.FCM_API_KEY.isNotEmpty()

    /** Idempotent -- safe to call from every entry point that might be first. */
    fun ensureFirebaseInitialized(context: android.content.Context) {
        if (!isConfigured) return
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FCM_API_KEY)
                .setApplicationId(BuildConfig.FCM_APP_ID)
                .setProjectId(BuildConfig.FCM_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                .build()
        )
    }
}
