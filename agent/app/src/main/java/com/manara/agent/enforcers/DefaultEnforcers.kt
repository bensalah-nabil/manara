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
        AppChangesEnforcer(context),
        ManagedNoticeEnforcer(context)
    ),
    isManaged = { isManaged(context) },
    onFailure = { id, error -> ruleFailed(context, id, error) },
    onApplied = { id -> ruleApplied(context, id) },
)

/** The rules [LiveRules] re-checks every minute while the screen is on. */
fun liveEnforcerRegistry(context: Context): EnforcerRegistry = EnforcerRegistry(
    listOf(TimeLimitEnforcer(context), BrowserBlockEnforcer(context), LockEnforcer(context), CallLogEnforcer(context)),
    isManaged = { isManaged(context) },
    onFailure = { id, error -> ruleFailed(context, id, error) },
    onApplied = { id -> ruleApplied(context, id) },
)

/**
 * A rule that threw is reported to the parent as a broken protection ("apply_failed" under that
 * rule), not only logged: the sync itself now succeeds, so nothing else would show it (audit
 * 2026-11-21). The next apply without an error reports it back in effect.
 */
private fun ruleFailed(context: Context, enforcerId: String, error: Exception) {
    android.util.Log.w("ManaraEnforcers", "Rule $enforcerId failed to apply; the others still ran", error)
    runCatching { ruleHealth(context, enforcerId).observe(CHECK_APPLY_FAILED, false) }
        .onFailure { android.util.Log.w("ManaraEnforcers", "Cannot record the failure of $enforcerId", it) }
}

private fun ruleApplied(context: Context, enforcerId: String) {
    // Cheap when nothing was broken: only a change sends an event.
    runCatching { ruleHealth(context, enforcerId).observe(CHECK_APPLY_FAILED, true) }
        .onFailure { android.util.Log.w("ManaraEnforcers", "Cannot record $enforcerId as applied", it) }
}

private fun ruleHealth(context: Context, enforcerId: String) =
    HealthTracker(context, context.getSharedPreferences("manara_rule_health", Context.MODE_PRIVATE), enforcerId)

private const val CHECK_APPLY_FAILED = "apply_failed"

private fun isManaged(context: Context): Boolean =
    context.getSystemService(android.app.admin.DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName)
