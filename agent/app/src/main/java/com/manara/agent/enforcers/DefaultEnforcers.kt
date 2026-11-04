package com.manara.agent.enforcers

import android.content.Context

/**
 * The one place that lists every active enforcer — was duplicated ad hoc
 * across `MainActivity`, `SyncWorker`, and `EnrollmentActivity` before this
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
        RestrictionsEnforcer(context)
    )
)
