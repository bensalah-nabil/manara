package com.manara.agent.enforcers

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import com.manara.agent.events.Event
import com.manara.agent.events.enforcementEvent
import com.manara.agent.policy.Policy

/**
 * Blocks every browser except Chrome, including one installed later ([BrowserBlockDecision]).
 * A browser is any app that offers to open an arbitrary https link; the manifest's `<queries>`
 * makes those visible. An app with a built-in browser that doesn't declare this isn't found.
 */
class BrowserBlockEnforcer(context: Context) : PolicyEnforcer {
    override val id = "browser-block"

    private val packageManager = context.packageManager
    private val pauses = AppPauses(context)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        val enabled = policy.browser.blockOtherBrowsers
        val previous = prefs.getStringSet(KEY_BLOCKED, emptySet()).orEmpty().filter(::isInstalled).toSet()
        val decision = BrowserBlockDecision.decide(enabled, if (enabled) installedBrowsers() else emptySet(), previous)
        prefs.edit().putStringSet(KEY_BLOCKED, decision.toBlock).apply()
        // The shared record resumes what this rule lets go of, unless another still holds it (ADR-0009).
        val outcome = pauses.hold(id, decision.toBlock)

        report(KEY_LAST_PROBLEM, listOfNotNull(
            "Chrome is not installed, so no browser can open".takeIf { enabled && !isInstalled(BrowserPolicyDecision.CHROME) },
            problem("block", outcome.paused, outcome.refusedPause, outcome.pauseError),
            problem("resume", outcome.resumed, outcome.refusedResume, outcome.resumeError),
        ).joinToString("; "))
    }

    /** What went wrong with one change, or null. Android refuses to suspend some essential apps. */
    private fun problem(action: String, acted: Set<String>, refused: List<String>, error: Throwable?): String? = when {
        acted.isEmpty() -> null
        error != null -> "$action: ${error.javaClass.simpleName}"
        refused.isNotEmpty() -> "$action refused: ${refused.joinToString()}"
        else -> null
    }

    /** This runs every minute while the screen is on, so one problem is reported once, not each time. */
    private fun report(key: String, problem: String) {
        if (prefs.getString(key, "") == problem) return
        prefs.edit().putString(key, problem).apply()
        if (problem.isNotEmpty()) {
            Log.w(TAG, problem)
            pendingEvents.add(enforcementEvent(id, "failed", problem))
        }
    }

    private fun installedBrowsers(): Set<String> {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.invalid/")).addCategory(Intent.CATEGORY_BROWSABLE)
        return packageManager.queryIntentActivities(intent, PackageManager.MATCH_ALL).map { it.activityInfo.packageName }.toSet()
    }

    private fun isInstalled(packageName: String): Boolean =
        runCatching { packageManager.getApplicationInfo(packageName, 0) }.isSuccess

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    companion object {
        private const val TAG = "ManaraBrowserBlock"
        private const val PREFS_NAME = "browser_block_enforcer"
        private const val KEY_BLOCKED = "blocked_packages"
        private const val KEY_LAST_PROBLEM = "last_problem"
    }
}
