package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.util.Log
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.enforcementEvent
import com.manara.agent.policy.Policy

/**
 * Sets Chrome's managed configuration as the device owner
 * (`DevicePolicyManager.setApplicationRestrictions`). The decision is in
 * [BrowserPolicyDecision]; this class is only the I/O. Chrome applies the
 * change itself (DnsOverHttpsMode is marked dynamic_refresh in its definition).
 * Other browsers are not covered, and the console says so.
 */
class BrowserPolicyEnforcer(context: Context) : PolicyEnforcer {
    override val id = "browser"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        val desired = BrowserPolicyDecision.restrictions(policy.browser)
        val current = runCatching { devicePolicyManager.getApplicationRestrictions(admin, BrowserPolicyDecision.CHROME) }
            .onFailure { Log.w(TAG, "getApplicationRestrictions threw", it) }
            .getOrNull()
        if (current != null && BrowserPolicyDecision.same(current.toMap(), desired)) return

        runCatching { devicePolicyManager.setApplicationRestrictions(admin, BrowserPolicyDecision.CHROME, desired.toBundle()) }
            .onSuccess { Log.i(TAG, "Chrome configuration set: ${desired.keys}") }
            .onFailure {
                Log.w(TAG, "setApplicationRestrictions threw", it)
                pendingEvents.add(enforcementEvent(id, "failed", "chrome: ${it.javaClass.simpleName}"))
            }
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    private fun Bundle.toMap(): Map<String, Any?> = keySet().associateWith {
        @Suppress("DEPRECATION") // Typed getters need the type up front; this compares whatever is stored.
        get(it)
    }

    private fun Map<String, Any>.toBundle(): Bundle = Bundle().also { bundle ->
        forEach { (key, value) ->
            when (value) {
                is Boolean -> bundle.putBoolean(key, value)
                is Int -> bundle.putInt(key, value)
                is String -> bundle.putString(key, value)
                is Array<*> -> bundle.putStringArray(key, value.filterIsInstance<String>().toTypedArray())
            }
        }
    }

    companion object {
        private const val TAG = "ManaraBrowser"
    }
}
