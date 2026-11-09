package com.manara.agent.enforcers

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import android.util.Log
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * Sends the number, direction, time and length of each call while the parent has this on, and
 * the phone says so on its notice and status screen (ADR-0008). Never names, audio or SMS.
 * Only the `direct` build declares READ_CALL_LOG, so on a `play` build this reports a missing
 * permission to the parent and reads nothing.
 */
class CallLogEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "call-log"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val health = HealthTracker(context, prefs, id)
    private val pendingEvents = mutableListOf<Event>()
    private var pendingCursor: Long? = null

    override fun apply(policy: Policy) {
        if (!policy.callLog.enabled) {
            turnOff()
            return
        }
        // No history: the first run starts from now, when the child's notice starts saying so.
        if (!prefs.contains(KEY_CURSOR)) prefs.edit().putLong(KEY_CURSOR, System.currentTimeMillis()).apply()
        grantToSelf()
        val allowed = hasPermission()
        health.observe(CHECK_PERMISSION, allowed)
        // Calls inside messaging apps need notification access, which only the parent can turn on.
        if (CallNotificationListener.isDeclared(context)) {
            val notifications = context.getSystemService(android.app.NotificationManager::class.java)
            health.observe(CHECK_APP_CALLS, notifications.isNotificationListenerAccessGranted(CallNotificationListener.component(context)))
        }
        if (!allowed) return

        val rows = runCatching { readAfter(prefs.getLong(KEY_CURSOR, 0L)) }
            .onFailure { Log.w(TAG, "Cannot read the call log", it) }
            .getOrNull() ?: return
        val batch = CallLogDecision.newCalls(rows, prefs.getLong(KEY_CURSOR, 0L))
        pendingEvents.clear()
        batch.calls.mapNotNullTo(pendingEvents, ::toEvent)
        pendingCursor = batch.newCursor
    }

    /**
     * The cursor moves only here. Not every caller of apply() collects events (the app screen
     * doesn't), and a call lost to that could never be sent again. A re-read call keeps its id,
     * and the server ignores an id it already has.
     */
    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        pendingCursor?.let { prefs.edit().putLong(KEY_CURSOR, it).apply() }
        pendingCursor = null
        return events
    }

    private fun turnOff() {
        health.forget(CHECK_PERMISSION)
        health.forget(CHECK_APP_CALLS)
        pendingEvents.clear()
        pendingCursor = null
        if (prefs.contains(KEY_CURSOR)) {
            prefs.edit().remove(KEY_CURSOR).apply()
            runCatching {
                devicePolicyManager.setPermissionGrantState(admin, context.packageName, Manifest.permission.READ_CALL_LOG, DevicePolicyManager.PERMISSION_GRANT_STATE_DENIED)
            }.onFailure { Log.w(TAG, "Cannot withdraw the permission", it) }
        }
    }

    private fun grantToSelf() {
        if (hasPermission()) return
        runCatching {
            devicePolicyManager.setPermissionGrantState(admin, context.packageName, Manifest.permission.READ_CALL_LOG, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }.onSuccess { granted -> if (!granted) Log.w(TAG, "READ_CALL_LOG not granted") }
            .onFailure { Log.w(TAG, "Cannot grant READ_CALL_LOG", it) }
    }

    private fun hasPermission(): Boolean =
        context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED

    private fun readAfter(cursor: Long): List<CallLogDecision.Row> {
        val columns = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.PHONE_ACCOUNT_COMPONENT_NAME)
        val cursorRows = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI, columns, "${CallLog.Calls.DATE} > ?", arrayOf(cursor.toString()), "${CallLog.Calls.DATE} ASC"
        ) ?: return emptyList()
        return cursorRows.use { rows ->
            buildList {
                while (rows.moveToNext() && size < CallLogDecision.MAX_PER_RUN) {
                    val source = rows.getString(5)?.substringBefore('/')
                    add(CallLogDecision.Row(rows.getLong(0), rows.getString(1), rows.getInt(2), rows.getLong(3), rows.getLong(4), source))
                }
            }
        }
    }

    private fun toEvent(row: CallLogDecision.Row): Event? {
        val direction = CallLogDecision.direction(row.type) ?: return null
        return Event(
            id = UUID.nameUUIDFromBytes("call:${row.id}:${row.dateMillis}".toByteArray()).toString(),
            kind = EventKind.call,
            occurredAt = Instant.ofEpochMilli(row.dateMillis).toString(),
            payload = JsonObject(
                buildMap {
                    put("number", JsonPrimitive(CallLogDecision.number(row.number)))
                    put("direction", JsonPrimitive(direction))
                    put("durationSeconds", JsonPrimitive(row.durationSeconds))
                    CallLogDecision.appOf(row)?.let { put("app", JsonPrimitive(it)) }
                    put("source", JsonPrimitive("call_log"))
                }
            ),
        )
    }

    private companion object {
        const val TAG = "ManaraCallLog"
        const val PREFS_NAME = "call_log_enforcer"
        const val KEY_CURSOR = "cursor"
        const val CHECK_PERMISSION = "read_call_log"
        const val CHECK_APP_CALLS = "app_call_notifications"
    }
}
