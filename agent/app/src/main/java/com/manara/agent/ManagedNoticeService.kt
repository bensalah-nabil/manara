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
 * a policy enforcer and has no "enabled" flag: whenever the agent runs, this
 * runs. There is deliberately no code path that hides or cancels it.
 *
 * In Phase 0 it also serves as the keep-alive probe: if the manufacturer kills
 * it, we see the notice vanish — that's a finding, not a bug to hide.
 *
 * Its process stays alive, so it also hosts [LiveRules]; that loop can't stop the notice.
 */
class ManagedNoticeService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, buildNotification())
        scope.launch {
            try {
                PolicyCache(ManaraDatabase.get(applicationContext)).observe().collect { policy ->
                    getSystemService(NotificationManager::class.java)
                        .notify(NOTIFICATION_ID, buildNotification(NoticeSummary.lines(AndroidWords(applicationContext), policy)))
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w("ManaraNotice", "Cannot refresh notice summary", error)
            }
        }
        scope.launch { LiveRules(applicationContext).run() }
    }

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
