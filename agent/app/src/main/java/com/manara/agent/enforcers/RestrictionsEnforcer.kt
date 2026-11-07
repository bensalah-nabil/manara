package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.util.Log
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.enforcementEvent
import com.manara.agent.policy.Policy

/**
 * Closes the Settings-level bypasses (capability-plan.md A2): VPN and
 * Private DNS configuration, factory reset, safe boot, adding users. The
 * decision is in [RestrictionDecision]; this class is only the
 * `DevicePolicyManager` I/O.
 *
 * Re-asserted on every apply, so a restriction that disappeared is put
 * back and reported (`enforcement`/`missing`) rather than silently lost.
 */
class RestrictionsEnforcer(context: Context) : PolicyEnforcer {
    override val id = "restrictions"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val pendingEvents = mutableListOf<Event>()

    // Persisted for the same reason as TimeLimitEnforcer's state: a new instance must not forget what it applied.
    private var applied: Set<String>
        get() = prefs.getStringSet(KEY_APPLIED, emptySet()).orEmpty()
        set(value) = prefs.edit().putStringSet(KEY_APPLIED, value).apply()

    override fun apply(policy: Policy) {
        val desired = RestrictionDecision.desiredKeys(
            policy.restrictions, Build.VERSION.SDK_INT,
            debuggingBlockAllowed = !com.manara.agent.BuildConfig.DEBUG && !com.manara.agent.setup.SetupService.isRunning
        )
        val active = runCatching { devicePolicyManager.getUserRestrictions(admin) }
            .onFailure { Log.w(TAG, "getUserRestrictions threw", it) }
            .getOrNull()
            ?.let { bundle -> bundle.keySet().filter { bundle.getBoolean(it) }.toSet() }
            ?: emptySet()

        val decision = RestrictionDecision.decide(desired, applied, active)
        decision.unexpectedlyMissing.forEach {
            Log.w(TAG, "restriction $it was applied but is no longer active")
            pendingEvents.add(enforcementEvent(id, "missing", it))
        }

        val failed = mutableSetOf<String>()
        decision.toAdd.forEach { key ->
            runCatching { devicePolicyManager.addUserRestriction(admin, key) }.onFailure {
                Log.w(TAG, "addUserRestriction($key) threw", it)
                failed += key
                pendingEvents.add(enforcementEvent(id, "failed", "add $key: ${it.javaClass.simpleName}"))
            }
        }
        decision.toClear.forEach { key ->
            runCatching { devicePolicyManager.clearUserRestriction(admin, key) }.onFailure {
                Log.w(TAG, "clearUserRestriction($key) threw", it)
                pendingEvents.add(enforcementEvent(id, "failed", "clear $key: ${it.javaClass.simpleName}"))
            }
        }
        applied = desired - failed
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    companion object {
        private const val TAG = "ManaraRestrictions"
        private const val PREFS_NAME = "restrictions_enforcer"
        private const val KEY_APPLIED = "applied_restrictions"
    }
}
