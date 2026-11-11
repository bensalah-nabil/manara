package com.manara.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.manara.agent.enforcers.LiveRules
import com.manara.agent.policy.NoticeSummary
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.text.AndroidWords
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * A foreground service whose only job is to keep a permanent, non-dismissible
 * "this device is managed" notification on screen.
 *
 * This is the embodiment of ADR-0001 (monitoring is always visible). It is NOT
 * a policy enforcer and has no "enabled" flag: whenever Manara manages the phone,
 * this runs. There is deliberately no code path that hides it while it does.
 *
 * In Phase 0 it also serves as the keep-alive probe: if the manufacturer kills
 * it, we see the notice vanish — that's a finding, not a bug to hide.
 *
 * Its process stays alive, so it also hosts [LiveRules]; that loop can't stop the notice.
 */
class ManagedNoticeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** The policy the notice last showed, so a language change can re-post it. */
    @Volatile private var shown: com.manara.agent.policy.Policy? = null
    @Volatile private var received = false

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        if (!isDeviceOwner()) {
            // OwnerReceiver.onEnabled starts this on every `set-device-owner` try, refused ones too:
            // the shell makes Manara an admin before asking for owner. Seen on the SM-A528B: "This
            // device is managed" on a phone Manara didn't manage. A try that works starts it again
            // (AdbSetupDevice.setDeviceOwner), and so do boot and opening Manara.
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }
        scope.launch {
            try {
                PolicyCache(ManaraDatabase.get(applicationContext)).observe().collect { policy ->
                    shown = policy
                    received = true
                    post(policy)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w("ManaraNotice", "Cannot refresh notice summary", error)
            }
        }
        scope.launch { LiveRules(applicationContext).run() }
    }

    /**
     * The phone's or Manara's own language changed (seen on the SM-A528B: the screen switched to
     * Arabic and the notice stayed English, since it was only rebuilt on a new policy).
     */
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        if (received) post(shown) else startForeground(NOTIFICATION_ID, buildNotification())
    }

    private fun post(policy: com.manara.agent.policy.Policy?) {
        // A release deletes the rules, and that change arrives here too: posting then would leave
        // "This device is managed" on a phone Manara no longer manages (seen on the SM-A528B).
        if (!isDeviceOwner()) return
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(NoticeSummary.lines(AndroidWords(this), policy)))
    }

    private fun isDeviceOwner(): Boolean =
        getSystemService(android.app.admin.DevicePolicyManager::class.java).isDeviceOwnerApp(packageName)

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // If the system restarts the service, re-post the notice.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(summary: List<String> = emptyList()): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notice_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notice_channel_description)
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        if (summary.isNotEmpty()) {
            builder.setStyle(
                Notification.BigTextStyle().bigText(getString(R.string.notice_text) + "\n" + summary.joinToString("\n"))
            )
        }
        return builder
            .setContentTitle(getString(R.string.notice_title))
            .setContentText(getString(R.string.notice_text))
            .setSmallIcon(R.drawable.ic_stat_manara)
            .setOngoing(true)          // cannot be swiped away
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "manara_managed_notice"
        private const val NOTIFICATION_ID = 1001

        fun stop(context: Context) {
            context.stopService(Intent(context, ManagedNoticeService::class.java))
        }

        /** Removes the notice itself, for a phone Manara no longer manages. */
        fun dismiss(context: Context) {
            stop(context)
            context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
        }

        /** Start the notice service in a way that works from any context. */
        fun start(context: Context) {
            val intent = Intent(context, ManagedNoticeService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
