package com.manara.agent.enforcers

import android.os.UserManager
import com.manara.agent.policy.Policy

/**
 * Pure decision for [RestrictionsEnforcer]: which `UserManager.DISALLOW_*`
 * keys to add or clear, and which ones went missing. Kept apart from the
 * `DevicePolicyManager` calls so it can be unit-tested on the JVM, the same
 * split as `TimeLimitDecision`.
 *
 * Every key and minimum API level below comes from the official
 * `UserManager` reference (developer.android.com, checked 2026-11-04):
 * - `DISALLOW_CONFIG_VPN`: API 21, device owner. It also stops user VPNs
 *   from starting; device-owner always-on VPNs still start (API 24+).
 * - `DISALLOW_CONFIG_PRIVATE_DNS`: API 29, device owner only.
 * - `DISALLOW_FACTORY_RESET`: API 21. Blocks reset **from Settings** only.
 *   The reference doesn't claim it covers recovery mode.
 * - `DISALLOW_SAFE_BOOT`: API 23.
 * - `DISALLOW_ADD_USER`: API 21.
 */
object RestrictionDecision {

    data class Result(
        val toAdd: Set<String>,
        val toClear: Set<String>,
        /** Applied by Manara earlier, still wanted, but not active anymore. */
        val unexpectedlyMissing: Set<String>
    )

    fun desiredKeys(restrictions: Policy.Restrictions, sdkInt: Int): Set<String> = buildSet {
        if (restrictions.blockVpnConfig) add(UserManager.DISALLOW_CONFIG_VPN)
        if (restrictions.blockPrivateDnsConfig && sdkInt >= 29) add(UserManager.DISALLOW_CONFIG_PRIVATE_DNS)
        if (restrictions.blockFactoryReset) add(UserManager.DISALLOW_FACTORY_RESET)
        if (restrictions.blockSafeBoot) add(UserManager.DISALLOW_SAFE_BOOT)
        if (restrictions.blockAddUser) add(UserManager.DISALLOW_ADD_USER)
    }

    /**
     * @param previouslyApplied keys Manara itself added before. Only these are
     *   ever cleared, so a restriction set some other way is never removed.
     * @param currentlyActive keys this admin currently has in effect.
     */
    fun decide(
        desired: Set<String>,
        previouslyApplied: Set<String>,
        currentlyActive: Set<String>
    ): Result = Result(
        toAdd = desired - currentlyActive,
        toClear = (previouslyApplied - desired) intersect currentlyActive,
        unexpectedlyMissing = (previouslyApplied intersect desired) - currentlyActive
    )
}
