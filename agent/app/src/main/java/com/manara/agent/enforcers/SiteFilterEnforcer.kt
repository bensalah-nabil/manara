package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.manara.agent.OwnerReceiver
import com.manara.agent.events.Event
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

    override fun apply(policy: Policy) {
        val filter = policy.siteFilter
        runCatching {
            if (filter.enabled && !filter.dnsHost.isNullOrBlank()) {
                devicePolicyManager.setGlobalPrivateDnsModeSpecifiedHost(admin, filter.dnsHost)
            } else {
                devicePolicyManager.setGlobalPrivateDnsModeOpportunistic(admin)
            }
        }
    }

    // A DNS mode change is a standing setting, not an observation -- nothing to report.
    override fun collectEvents(): List<Event> = emptyList()
}
