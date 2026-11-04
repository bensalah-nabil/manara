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
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        val filter = policy.siteFilter
        // Both setters return a PRIVATE_DNS_SET_* code (confirmed in the
        // compileSdk 34 android.jar) -- a non-zero code is a failure too, not just a throw.
        runCatching {
            if (filter.enabled && !filter.dnsHost.isNullOrBlank()) {
                devicePolicyManager.setGlobalPrivateDnsModeSpecifiedHost(admin, filter.dnsHost)
            } else {
                devicePolicyManager.setGlobalPrivateDnsModeOpportunistic(admin)
            }
        }.onSuccess { code ->
            if (code != DevicePolicyManager.PRIVATE_DNS_SET_NO_ERROR) {
                Log.w(TAG, "Private DNS change rejected, code=$code host=${filter.dnsHost}")
                pendingEvents.add(enforcementEvent(id, "failed", describe(code)))
            }
        }.onFailure {
            Log.w(TAG, "Private DNS change threw", it)
            pendingEvents.add(enforcementEvent(id, "failed", it.javaClass.simpleName))
        }
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
        private const val TAG = "ManaraSiteFilter"
    }
}
