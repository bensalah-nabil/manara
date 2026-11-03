package com.manara.agent.enforcers

import android.content.Context
import com.manara.agent.events.Event
import com.manara.agent.location.LocationNoticeService
import com.manara.agent.policy.Policy

/**
 * architecture.md §2.2: fused location in a **visible** foreground service
 * (ADR-0001 twice over — see `LocationNoticeService`'s own doc comment).
 * This class just starts or stops that service based on policy; the actual
 * location requests and event-writing live there, since the service may
 * run (and keep writing events) across many `apply()`/`collectEvents()`
 * cycles, not just within one.
 *
 * Fails closed the same way `TimeLimitEnforcer` does without Usage Access —
 * found testing on a real device: with the device-wide **Location** toggle
 * off (Settings → Location), `FusedLocationProviderClient` silently
 * produces no fixes, even with `ACCESS_FINE_LOCATION` correctly
 * self-granted. Unlike Usage Access there's no Device Owner API to force
 * this on — it's a genuine user/physical-access-only setting, not
 * something to work around.
 */
class LocationEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "location"

    override fun apply(policy: Policy) {
        if (policy.location.enabled) {
            LocationNoticeService.start(context, intervalMinutes = policy.location.intervalMinutes)
        } else {
            LocationNoticeService.stop(context)
        }
    }

    override fun collectEvents(): List<Event> = emptyList()
}
