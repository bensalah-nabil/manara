package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import com.manara.agent.OwnerReceiver
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

    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val packageManager = context.packageManager
    private val admin = ComponentName(context, OwnerReceiver::class.java)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        val enabled = policy.browser.blockOtherBrowsers
        val previous = prefs.getStringSet(KEY_BLOCKED, emptySet()).orEmpty().filter(::isInstalled).toSet()
        val decision = BrowserBlockDecision.decide(enabled, if (enabled) installedBrowsers() else emptySet(), previous)
        prefs.edit().putStringSet(KEY_BLOCKED, decision.toBlock).apply()

        report(KEY_LAST_PROBLEM, listOfNotNull(
            "Chrome is not installed, so no browser can open".takeIf { enabled && !isInstalled(BrowserPolicyDecision.CHROME) },
            suspend(decision.toBlock, true),
            suspend(decision.toResume, false),
        ).joinToString("; "))
    }

    /** Returns what went wrong, or null. Android refuses to suspend some essential apps. */
    private fun suspend(packages: Set<String>, suspended: Boolean): String? {
        if (packages.isEmpty()) return null
        return runCatching { devicePolicyManager.setPackagesSuspended(admin, packages.toTypedArray(), suspended) }
            .fold(
                onSuccess = { refused -> refused?.takeIf { it.isNotEmpty() }?.let { "${if (suspended) "block" else "resume"} refused: ${it.sorted().joinToString()}" } },
                onFailure = {
                    Log.w(TAG, "setPackagesSuspended threw", it)
                    "${if (suspended) "block" else "resume"}: ${it.javaClass.simpleName}"
                },
            )
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
