package com.manara.agent.enforcers

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * Opt-in: tells the parent when an app is installed or removed (roadmap W1). It only runs while
 * `policy.appChanges.enabled`, and the managed notice and status screen say so (ADR-0001). What
 * changed is decided in [AppChangesDecision]; this class only reads the phone's apps.
 *
 * The comparison happens in [collectEvents], right before the events go into the phone's own
 * queue, so the saved list and the reported changes move together: an app installed offline is
 * reported at the next sync, not lost.
 */
class AppChangesEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "app-changes"

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override fun apply(policy: Policy) {
        if (!policy.appChanges.enabled) {
            // Turned off: forget the list, so turning it on again starts from what is there then.
            if (prefs.getBoolean(KEY_ON, false) || prefs.contains(KEY_LIST)) prefs.edit().clear().apply()
            return
        }
        prefs.edit().putBoolean(KEY_ON, true).apply()
    }

    override fun collectEvents(): List<Event> {
        if (!prefs.getBoolean(KEY_ON, false)) return emptyList()
        val current = runCatching { installedApps() }
            .onFailure { Log.w(TAG, "could not list apps", it) }
            .getOrNull() ?: return emptyList()
        val previous = prefs.getString(KEY_LIST, null)?.let { saved ->
            runCatching { json.decodeFromString<Map<String, String>>(saved) }
                .onFailure { Log.w(TAG, "saved app list unreadable; starting again", it) }
                .getOrNull()
        }
        val now = System.currentTimeMillis()
        val changes = AppChangesDecision.changes(previous, current, context.packageName, now)
        prefs.edit().putString(KEY_LIST, json.encodeToString(AppChangesDecision.snapshot(current, context.packageName))).apply()
        if (changes.isNotEmpty()) Log.i(TAG, "${changes.size} app change(s) to report")
        return changes.map(::toEvent)
    }

    /**
     * Every app with a launcher icon, including ones paused or disabled for a while (guided
     * setup pauses apps with `pm disable-user`), so a pause never reads as a removal. The
     * manifest's `<queries>` makes launcher apps visible.
     */
    private fun installedApps(): List<AppChangesDecision.App> {
        val pm = context.packageManager
        val flags = PackageManager.MATCH_DISABLED_COMPONENTS or PackageManager.MATCH_DISABLED_UNTIL_USED_COMPONENTS
        return pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), flags)
            .distinctBy { it.activityInfo.packageName }
            .map { info ->
                val pkg = info.activityInfo.packageName
                val installedAt = runCatching { pm.getPackageInfo(pkg, 0).firstInstallTime }.getOrDefault(0L)
                AppChangesDecision.App(pkg, info.loadLabel(pm).toString(), installedAt)
            }
    }

    private fun toEvent(change: AppChangesDecision.Change) = Event(
        id = UUID.randomUUID().toString(),
        kind = EventKind.app_change,
        occurredAt = Instant.ofEpochMilli(change.at).toString(),
        payload = JsonObject(
            mapOf(
                "action" to JsonPrimitive(change.action),
                "package" to JsonPrimitive(change.packageName),
                "label" to JsonPrimitive(change.label),
            )
        )
    )

    private companion object {
        const val TAG = "ManaraAppChanges"
        const val PREFS_NAME = "app_changes_enforcer"
        const val KEY_ON = "on"
        const val KEY_LIST = "apps"
    }
}
