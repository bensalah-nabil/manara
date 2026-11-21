package com.manara.agent.enforcers

import android.content.Context

/**
 * The one place that lists every active enforcer — was duplicated ad hoc
 * across `MainActivity` and `SyncWorker` before this
 * existed, getting worse as enforcers were added. Adding a capability is
 * still "one class, one line" (architecture.md §2.2) — just this line, now
 * in one place instead of three.
 */
fun defaultEnforcerRegistry(context: Context): EnforcerRegistry = EnforcerRegistry(
    listOf(
        TimeLimitEnforcer(context),
        LockEnforcer(context),
        SiteFilterEnforcer(context),
        LocationEnforcer(context),
        RestrictionsEnforcer(context),
        UsageReportEnforcer(context),
        BrowserPolicyEnforcer(context),
        BrowserBlockEnforcer(context),
        CallLogEnforcer(context),
        AppChangesEnforcer(context)
    ),
    isManaged = { isManaged(context) },
    onFailure = ::logFailure,
)

/** The rules [LiveRules] re-checks every minute while the screen is on. */
fun liveEnforcerRegistry(context: Context): EnforcerRegistry = EnforcerRegistry(
    listOf(TimeLimitEnforcer(context), BrowserBlockEnforcer(context), LockEnforcer(context), CallLogEnforcer(context)),
    isManaged = { isManaged(context) },
    onFailure = ::logFailure,
)

private fun logFailure(enforcerId: String, error: Exception) {
    android.util.Log.w("ManaraEnforcers", "Rule $enforcerId failed to apply; the others still ran", error)
}

private fun isManaged(context: Context): Boolean =
    context.getSystemService(android.app.admin.DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName)
