package com.manara.agent.setup

import com.manara.agent.R
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.app.Service
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.ManaraApiFactory
import com.manara.agent.sync.SetupAccountDto
import com.manara.agent.sync.SetupReportRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Runs guided setup while showing it on the phone itself. The pairing code is typed into
 * this notification; nothing about setup is hidden from whoever holds the phone.
 */
class SetupService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        current = this
        startForeground(NOTIFICATION_ID, notification("Starting guided setup.", askForCode = false))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running) return START_NOT_STICKY
        running = true
        finished = false
        onPairingInput = { valid ->
            if (valid) show("Pairing with wireless debugging...", askForCode = false)
            else show("That wasn't a 6-digit code. Enter the Wi-Fi pairing code shown on the pairing screen.", askForCode = true)
        }
        scope.launch {
            try {
                val device = AdbSetupDevice(this@SetupService, pairingInput = { retry ->
                    pairing = CompletableDeferred()
                    show(retry ?: ASK_FOR_CODE, askForCode = true)
                    pairing.await()
                }, parentFinished = { finished })
                SetupRunner(device, report = ::report).run()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.e(TAG, "guided setup stopped", error)
            } finally {
                running = false
                onPairingInput = null
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (current === this) current = null
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun report(report: SetupFlow.Report) {
        show(report.message, askForCode = false, canFinish = report.step == SetupFlow.Step.RECONNECTING)
        val token = DeviceTokenStore(this).deviceToken()
        if (token == null) {
            Log.w(TAG, "not enrolled; report not sent")
            return
        }
        val request = SetupReportRequest(
            step = report.step.wire,
            status = report.status.wire,
            message = report.message,
            accounts = report.accounts?.map { SetupAccountDto(it.type, it.name) },
        )
        try {
            val response = ManaraApiFactory.create().reportSetup("Bearer $token", request)
            if (!response.isSuccessful) Log.w(TAG, "setup report rejected: HTTP ${response.code()}")
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "setup report not sent", error)
        }
    }

    private fun show(text: String, askForCode: Boolean, canFinish: Boolean = false) {
        last = Shown(text, askForCode, canFinish)
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text, askForCode, canFinish))
    }

    private fun notification(text: String, askForCode: Boolean, canFinish: Boolean = false): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Guided setup", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shows guided setup progress and asks for the wireless debugging pairing code."
            }
        )
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Manara setup: this phone is being set up for parental management")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setSmallIcon(R.drawable.ic_stat_manara)
            .setOngoing(true)
            // Android 14 lets the user swipe this away while Manara isn't device owner yet,
            // which would leave setup waiting for a code nobody can enter: post it again.
            .setDeleteIntent(
                PendingIntent.getBroadcast(
                    this, 2, Intent(this, SetupInputReceiver::class.java).setAction(ACTION_DISMISSED),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )
        if (askForCode) {
            val input = RemoteInput.Builder(KEY_PAIRING).setLabel("6-digit pairing code").build()
            val reply = PendingIntent.getBroadcast(
                this, 0, Intent(this, SetupInputReceiver::class.java).setAction(ACTION_PAIRING),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            builder.addAction(Notification.Action.Builder(null, "Enter code", reply).addRemoteInput(input).build())
        }
        if (canFinish) {
            val finish = PendingIntent.getBroadcast(
                this, 1, Intent(this, SetupInputReceiver::class.java).setAction(ACTION_FINISH),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            builder.addAction(Notification.Action.Builder(null, "Finish setup", finish).build())
        }
        return builder.build()
    }

    /** Receives the notification's reply and "Finish" taps; not exported. */
    class SetupInputReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_PAIRING -> {
                    val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_PAIRING)?.toString().orEmpty()
                    val parsed = SetupInput.parsePairing(text)
                    if (parsed != null) pairing.complete(parsed)
                    // Updating the notification also ends the reply spinner Android shows.
                    onPairingInput?.invoke(parsed != null)
                }
                ACTION_FINISH -> finished = true
                ACTION_DISMISSED -> showAgain()
            }
        }
    }

    companion object {
        private const val TAG = "ManaraSetup"
        private const val CHANNEL_ID = "manara_guided_setup"
        private const val NOTIFICATION_ID = 1003
        private const val KEY_PAIRING = "pairing"
        private const val ASK_FOR_CODE =
            "In Wireless debugging, tap Pair device with pairing code. Keep it open, then tap Enter code here and type its 6-digit code."
        private const val ACTION_PAIRING = "com.manara.agent.setup.PAIRING"
        private const val ACTION_FINISH = "com.manara.agent.setup.FINISH"
        private const val ACTION_DISMISSED = "com.manara.agent.setup.DISMISSED"

        private data class Shown(val text: String, val askForCode: Boolean, val canFinish: Boolean)
        @Volatile private var current: SetupService? = null
        @Volatile private var last: Shown? = null

        /** Posts the setup notice again, as last shown; nothing if setup isn't running. */
        fun showAgain() {
            val service = current ?: return
            if (!running) return
            val shown = last ?: Shown("Starting guided setup.", askForCode = false, canFinish = false)
            service.show(shown.text, shown.askForCode, shown.canFinish)
        }

        @Volatile private var running = false

        /** While setup runs, nothing may block the wireless debugging it works over. */
        val isRunning: Boolean get() = running
        @Volatile private var finished = false
        @Volatile private var pairing = CompletableDeferred<SetupInput.Pairing>()
        @Volatile private var onPairingInput: ((Boolean) -> Unit)? = null

        /** False on a phone Manara already manages, before enrollment, or below Android 11. */
        fun canStart(context: Context): Boolean =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                !context.getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName) &&
                DeviceTokenStore(context).deviceToken() != null

        fun start(context: Context) {
            if (!canStart(context)) return
            context.startForegroundService(Intent(context, SetupService::class.java))
        }
    }
}
