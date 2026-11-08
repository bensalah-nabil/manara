package com.manara.agent.setup

import com.manara.agent.R
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import com.manara.agent.sync.SetupInputDto
import com.manara.agent.sync.SetupPairingDto
import com.manara.agent.sync.SetupReportRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Runs guided setup while showing it on the phone itself. Every input is typed in the parent's
 * console (ADR-0005), so this notice only shows progress: nothing about setup is hidden from
 * whoever holds the phone, and nothing asks them to leave the Wireless debugging screen.
 */
class SetupService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        current = this
        startForeground(NOTIFICATION_ID, notification("Starting guided setup."))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running) return START_NOT_STICKY
        running = true
        last = null
        val qr = PairingDecision.newQrPairing()
        var qrDelivered = false
        scope.launch {
            try {
                // Pairing-step reports carry the QR code's name and password until the server has them.
                suspend fun report(report: SetupFlow.Report) {
                    val withQr = report.step == SetupFlow.Step.PAIRING && !qrDelivered
                    if (send(report, if (withQr) qr else null) && withQr) qrDelivered = true
                }
                val console = object : SetupConsole {
                    override val qr = qr
                    override suspend fun input(): SetupInputDto? = readInput()
                    override suspend fun pairingStatus(message: String) =
                        report(SetupFlow.Report(SetupFlow.Step.PAIRING, SetupFlow.Status.WAITING_FOR_PARENT, message, null))
                }
                // Read before the first report: a failed run's accounts must survive this one.
                val earlier = readInput()?.earlierAccounts.orEmpty().map { AccountDump.Account(it.type, it.name) }
                SetupRunner(AdbSetupDevice(this@SetupService, console), report = ::report, earlierAccounts = earlier).run()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.e(TAG, "guided setup stopped", error)
            } finally {
                running = false
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

    /** Shows the step on the phone and sends it to the console; true once the server has it. */
    private suspend fun send(report: SetupFlow.Report, qr: PairingDecision.QrPairing?): Boolean {
        show(report.message)
        val token = DeviceTokenStore(this).deviceToken()
        if (token == null) {
            Log.w(TAG, "not enrolled; report not sent")
            return false
        }
        val request = SetupReportRequest(
            step = report.step.wire,
            status = report.status.wire,
            message = report.message,
            accounts = report.accounts?.map { SetupAccountDto(it.type, it.name) },
            pairing = qr?.let { SetupPairingDto(it.name, it.password) },
        )
        return try {
            val response = ManaraApiFactory.create().reportSetup("Bearer $token", request)
            if (!response.isSuccessful) Log.w(TAG, "setup report rejected: HTTP ${response.code()}")
            response.isSuccessful
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "setup report not sent", error)
            false
        }
    }

    private suspend fun readInput(): SetupInputDto? {
        val token = DeviceTokenStore(this).deviceToken() ?: return null
        return try {
            val response = ManaraApiFactory.create().setupInput("Bearer $token")
            if (response.isSuccessful) response.body() else null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "setup input not read", error)
            null
        }
    }

    private fun show(text: String) {
        last = text
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text))
    }

    private fun notification(text: String): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Guided setup", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shows each step of guided setup."
            }
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Manara setup: this phone is being set up for parental management")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setSmallIcon(R.drawable.ic_stat_manara)
            .setOngoing(true)
            // Android 14 lets the user swipe this away while Manara isn't device owner yet;
            // setup must stay visible while it runs, so post it again.
            .setDeleteIntent(
                PendingIntent.getBroadcast(
                    this, 2, Intent(this, SetupInputReceiver::class.java).setAction(ACTION_DISMISSED),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            )
            .build()
    }

    /** Receives the notice being swiped away; not exported. */
    class SetupInputReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_DISMISSED) showAgain()
        }
    }

    companion object {
        private const val TAG = "ManaraSetup"
        private const val CHANNEL_ID = "manara_guided_setup"
        private const val NOTIFICATION_ID = 1003
        private const val ACTION_DISMISSED = "com.manara.agent.setup.DISMISSED"

        @Volatile private var running = false
        @Volatile private var current: SetupService? = null
        @Volatile private var last: String? = null

        /** While setup runs, nothing may block the wireless debugging it works over. */
        val isRunning: Boolean get() = running

        /** Posts the setup notice again, as last shown; nothing if setup isn't running. */
        fun showAgain() {
            val service = current ?: return
            if (!running) return
            service.show(last ?: "Starting guided setup.")
        }

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
