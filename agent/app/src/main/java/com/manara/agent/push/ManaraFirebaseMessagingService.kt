package com.manara.agent.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.manara.agent.sync.PushTokenStore
import com.manara.agent.sync.SyncWorker

/**
 * Receives FCM wake-up pings (data-only -- see the backend's fcm.Notifier,
 * which never sends a user-visible notification payload; ADR-0001 applies
 * to what happens *after* receipt, not to this message's own content). A
 * push just means "something's waiting," the same thing the next poll
 * would have found anyway -- dispatched the same proven way as the
 * periodic job (CLAUDE.md: `adb shell cmd jobscheduler run -f` doesn't
 * reliably invoke a WorkManager job, a real OneTimeWorkRequest does), not
 * a second code path to keep in sync with the first.
 *
 * Registered in AndroidManifest.xml. Only ever instantiated by the OS when
 * Firebase is actually initialized ([PushConfig.isConfigured]), so this
 * class itself needs no "is push enabled" check.
 */
class ManaraFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        PushTokenStore(applicationContext).save(token)
        SyncWorker.enqueueOneTime(applicationContext)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        SyncWorker.enqueueOneTime(applicationContext)
    }
}
