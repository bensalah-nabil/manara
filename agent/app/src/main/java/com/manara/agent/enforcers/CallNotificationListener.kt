package com.manara.agent.enforcers

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * Notices calls in WhatsApp, Messenger, Telegram and Viber (ADR-0008, source 2). Android shows
 * Manara every notification once access is on, so this returns at once for anything that isn't
 * a call notification from one of those apps, and never reads a title or text: no message, no
 * caller name. Only declared in the `direct` build. Does nothing while call history is off.
 */
class CallNotificationListener : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val open = mutableMapOf<String, CallNotificationDecision.Open>()
    private val lastMissed = mutableMapOf<String, Long>()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val app = CallNotificationDecision.APPS[sbn.packageName] ?: return
        val signal = signalOf(sbn.notification)
        if (signal == CallNotificationDecision.Signal.NONE) return
        val now = System.currentTimeMillis()
        val step = synchronized(open) {
            CallNotificationDecision.posted(app, open[app], signal, now, lastMissed[app]).also { step ->
                if (step.open == null) open.remove(app) else open[app] = step.open
                if (step.call?.direction == "missed") lastMissed[app] = now
            }
        }
        step.call?.let(::record)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val app = CallNotificationDecision.APPS[sbn.packageName] ?: return
        if (signalOf(sbn.notification) !in LIVE_SIGNALS) return
        val now = System.currentTimeMillis()
        val call = synchronized(open) {
            CallNotificationDecision.removed(app, open.remove(app), now).also { call ->
                if (call?.direction == "missed") lastMissed[app] = now
            }
        }
        call?.let(::record)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun signalOf(notification: Notification) = CallNotificationDecision.signal(
        category = notification.category,
        callType = notification.extras.getInt(EXTRA_CALL_TYPE, 0),
        ongoing = notification.flags and Notification.FLAG_ONGOING_EVENT != 0,
        usesChronometer = notification.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER, false),
    )

    private fun record(call: CallNotificationDecision.Call) {
        scope.launch {
            try {
                val db = ManaraDatabase.get(applicationContext)
                if (PolicyCache(db).current()?.callLog?.enabled != true) return@launch
                EventQueue(db).enqueue(toEvent(call))
                SyncWorker.enqueueOneTime(applicationContext)
            } catch (error: Exception) {
                Log.w(TAG, "Cannot record a call", error)
            }
        }
    }

    private fun toEvent(call: CallNotificationDecision.Call) = Event(
        id = UUID.randomUUID().toString(),
        kind = EventKind.call,
        occurredAt = Instant.ofEpochMilli(call.startMillis).toString(),
        payload = JsonObject(
            mapOf(
                "app" to JsonPrimitive(call.app),
                "direction" to JsonPrimitive(call.direction),
                "durationSeconds" to JsonPrimitive(call.durationSeconds),
                "source" to JsonPrimitive("notification"),
            )
        ),
    )

    companion object {
        private const val TAG = "ManaraCallNotice"
        private const val EXTRA_CALL_TYPE = "android.callType"
        private val LIVE_SIGNALS = setOf(CallNotificationDecision.Signal.RINGING, CallNotificationDecision.Signal.IN_CALL)

        fun component(context: Context) = ComponentName(context, CallNotificationListener::class.java)

        /** Whether this build has the listener at all: only `direct` declares it. */
        fun isDeclared(context: Context): Boolean =
            runCatching { context.packageManager.getServiceInfo(component(context), 0) }.isSuccess
    }
}
