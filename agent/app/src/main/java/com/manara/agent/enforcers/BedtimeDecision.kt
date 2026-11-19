package com.manara.agent.enforcers

import com.manara.agent.policy.Policy

/**
 * Pure: which apps bedtime keeps paused (roadmap P2).
 *
 * Bedtime used to call `lockNow()`, so a child could make emergency calls only and could not reach
 * a parent. Now, inside a lock window, every launchable app is paused through [AppPauses] except
 * the ones a child must keep: Manara itself, the phone app (calls, emergency calls included), the
 * texting app (a parent's text must show), the clock (the morning alarm) and Settings, plus the
 * apps the parent allows. A paused app's notifications are hidden and it cannot ring the phone
 * (AOSP android14-release and android15-release, `DevicePolicyManager.setPackagesSuspended`), so a
 * prayer-time app must be allowed for the dawn adhan to sound. The lock screen is untouched. Android refuses to pause the
 * default dialer, the home app and the device admin in any case (AOSP android14-release and
 * android15-release, `SuspendPackageHelper.canSuspendPackageForUser`); they are left out here so
 * that a refusal is never reported as a problem.
 */
object BedtimeDecision {
    /** The rule's id in [AppPauses]; [BlockNoticeDecision] words it. */
    const val RULE = "bedtime"

    /**
     * Sign-in code apps, never paused: a parent who set Manara up on a phone that also holds their
     * own authenticator was locked out of the console at night (2026-11-19). An app here that
     * the phone doesn't have changes nothing.
     */
    val AUTHENTICATORS = setOf(
        "com.google.android.apps.authenticator2", // Google Authenticator
        "com.azure.authenticator", // Microsoft Authenticator
        "com.authy.authy", // Twilio Authy
        "com.twofasapp", // 2FAS
        "com.beemdevelopment.aegis", // Aegis
    )

    /**
     * [launchable]: the apps with a launcher icon. [keepOpen]: what the phone always keeps usable at
     * bedtime. [allowed]: the parent's own list (`lockSchedule.allowedApps`). Outside every window,
     * nothing is held, so bedtime ending lets go of everything it paused.
     */
    fun appsToHold(
        windows: List<Policy.LockSchedule.Window>,
        dayOfWeek: Int,
        hour: Int,
        launchable: Set<String>,
        keepOpen: Set<String>,
        allowed: Set<String>,
    ): Set<String> =
        if (LockDecision.isWithinAnyWindow(windows, dayOfWeek, hour)) launchable - keepOpen - AUTHENTICATORS - allowed else emptySet()
}
