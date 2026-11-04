package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
import com.manara.agent.events.enforcementEvent
import com.manara.agent.policy.Policy

/**
 * architecture.md §2.2: `setGlobalPrivateDnsModeSpecifiedHost` — confirmed
 * during Phase 0 research (`docs/enrollment-options.md`) to be
 * device-owner-only, no profile-owner exception, unlike most
 * `DevicePolicyManager` calls. No pure-decision split needed here the way
 * `TimeLimitDecision`/`LockDecision` have one: the logic genuinely is just
 * "enabled with a host → pin it, otherwise → hand DNS mode back to
 * opportunistic," nothing with real branching to isolate and test.
 *
 * Real-device caution: pinning a wrong or unreachable DoT host here can
 * break the device's DNS resolution entirely until corrected — test with a
 * known-working host (e.g. `dns.google`), not an arbitrary string.
 */
class SiteFilterEnforcer(context: Context) : PolicyEnforcer {
    override val id = "site-filter"

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val health = HealthTracker(context, prefs, id)
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        val filter = policy.siteFilter
        val wantedHost = filter.dnsHost?.takeIf { filter.enabled && it.isNotBlank() }
        checkHostStillPinned(wantedHost)
        // Both setters return a PRIVATE_DNS_SET_* code (confirmed in the
        // compileSdk 34 android.jar) -- a non-zero code is a failure too, not just a throw.
        runCatching {
            if (wantedHost != null) {
                devicePolicyManager.setGlobalPrivateDnsModeSpecifiedHost(admin, wantedHost)
            } else {
                devicePolicyManager.setGlobalPrivateDnsModeOpportunistic(admin)
            }
        }.onSuccess { code ->
            if (code != DevicePolicyManager.PRIVATE_DNS_SET_NO_ERROR) {
                Log.w(TAG, "Private DNS change rejected, code=$code host=$wantedHost")
                pendingEvents.add(enforcementEvent(id, "failed", describe(code)))
            } else {
                prefs.edit().putString(KEY_APPLIED_HOST, wantedHost).apply()
            }
        }.onFailure {
            Log.w(TAG, "Private DNS change threw", it)
            pendingEvents.add(enforcementEvent(id, "failed", it.javaClass.simpleName))
        }
    }

    // Before re-pinning: was the host Manara set earlier changed behind its back?
    private fun checkHostStillPinned(wantedHost: String?) {
        if (wantedHost == null || prefs.getString(KEY_APPLIED_HOST, null) != wantedHost) {
            health.forget(CHECK_HOST)
            return
        }
        val pinned = runCatching {
            isHostPinned(
                devicePolicyManager.getGlobalPrivateDnsMode(admin),
                devicePolicyManager.getGlobalPrivateDnsHost(admin),
                wantedHost
            )
        }.getOrElse {
            Log.w(TAG, "Private DNS health check threw", it)
            pendingEvents.add(enforcementEvent(id, "failed", "health_check: ${it.javaClass.simpleName}"))
            return
        }
        health.observe(CHECK_HOST, pinned)
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    private fun describe(code: Int): String = when (code) {
        DevicePolicyManager.PRIVATE_DNS_SET_ERROR_HOST_NOT_SERVING -> "host_not_serving"
        DevicePolicyManager.PRIVATE_DNS_SET_ERROR_FAILURE_SETTING -> "failure_setting"
        else -> "code_$code"
    }

    companion object {
        internal fun isHostPinned(mode: Int, currentHost: String?, wantedHost: String): Boolean =
            mode == DevicePolicyManager.PRIVATE_DNS_MODE_PROVIDER_HOSTNAME && currentHost == wantedHost

        private const val TAG = "ManaraSiteFilter"
        private const val PREFS_NAME = "site_filter_enforcer"
        private const val KEY_APPLIED_HOST = "applied_host"
        private const val CHECK_HOST = "private_dns_host"
    }
}
