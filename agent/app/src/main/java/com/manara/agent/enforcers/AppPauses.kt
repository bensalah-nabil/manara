package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.manara.agent.OwnerReceiver

/**
 * The only code that pauses or reopens apps (ADR-0009). Each rule declares the apps it holds closed;
 * [PauseDecision] works out what changes; this applies it with `setPackagesSuspended` and keeps the
 * record, so one rule letting go never reopens an app another still holds.
 *
 * Infrastructure, like [EnforcerRegistry], not a capability: rules keep their own decisions.
 */
class AppPauses(private val context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val devicePolicyManager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, OwnerReceiver::class.java)

    /**
     * What one change did. [paused] and [resumed] are the apps it acted on; the refused lists are
     * the ones Android would not change (essential apps); an error means the call itself failed.
     */
    data class Outcome(
        val paused: Set<String> = emptySet(),
        val resumed: Set<String> = emptySet(),
        val refusedPause: List<String> = emptyList(),
        val refusedResume: List<String> = emptyList(),
        val pauseError: Throwable? = null,
        val resumeError: Throwable? = null,
    )

    /** [rule] now holds exactly [apps]; an empty set lets go of everything it held. */
    fun hold(rule: String, apps: Set<String>): Outcome = synchronized(LOCK) {
        applyChange(PauseDecision.hold(load(), rule, apps))
    }

    /** Release: reopens every app any rule held and empties the record. Needs device owner. */
    fun releaseAll(): Outcome = synchronized(LOCK) { applyChange(PauseDecision.releaseAll(load())) }

    /** The rules holding [app] right now, for the block screen and the child's notice. */
    fun reasons(app: String): Set<String> = synchronized(LOCK) { PauseDecision.reasons(load(), app) }

    private fun applyChange(change: PauseDecision.Change): Outcome {
        // The record first: a process killed mid-call still knows what it meant to hold.
        save(change.holds)
        val (refusedPause, pauseError) = suspend(change.toPause, true)
        val (refusedResume, resumeError) = suspend(change.toResume, false)
        return Outcome(change.toPause, change.toResume, refusedPause, refusedResume, pauseError, resumeError)
    }

    private fun suspend(apps: Set<String>, paused: Boolean): Pair<List<String>, Throwable?> {
        if (apps.isEmpty()) return emptyList<String>() to null
        return runCatching { devicePolicyManager.setPackagesSuspended(admin, apps.toTypedArray(), paused) }
            .fold(
                onSuccess = { refused -> refused.orEmpty().sorted() to null },
                onFailure = {
                    Log.w(TAG, "setPackagesSuspended($paused) threw", it)
                    emptyList<String>() to it
                },
            )
    }

    private fun load(): Map<String, Set<String>> {
        if (!prefs.getBoolean(KEY_MIGRATED, false)) save(PauseDecision.migrate(listsFromBeforeThisRecord()))
        return prefs.all.mapNotNull { (key, value) ->
            if (!key.startsWith(RULE_PREFIX) || value !is Set<*>) return@mapNotNull null
            key.removePrefix(RULE_PREFIX) to value.filterIsInstance<String>().toSet()
        }.toMap()
    }

    private fun save(holds: Map<String, Set<String>>) {
        val edit = prefs.edit()
        prefs.all.keys.filter { it.startsWith(RULE_PREFIX) }.forEach { edit.remove(it) }
        holds.forEach { (rule, apps) -> edit.putStringSet(RULE_PREFIX + rule, apps.toSet()) }
        edit.putBoolean(KEY_MIGRATED, true)
        edit.commit()
    }

    /**
     * Each rule's own list from before this record (ADR-0009, "Migration"). Named here once, for the
     * update only: those rules still keep these lists for their own decisions.
     */
    private fun listsFromBeforeThisRecord(): Map<String, Set<String>> = mapOf(
        "time-limit" to context.getSharedPreferences("time_limit_enforcer", Context.MODE_PRIVATE)
            .getStringSet("suspended_packages", emptySet()).orEmpty().toSet(),
        "browser-block" to context.getSharedPreferences("browser_block_enforcer", Context.MODE_PRIVATE)
            .getStringSet("blocked_packages", emptySet()).orEmpty().toSet(),
    )

    private companion object {
        const val TAG = "ManaraPauses"
        const val PREFS_NAME = "app_pauses"
        const val RULE_PREFIX = "rule:"
        const val KEY_MIGRATED = "migrated"
        /** Rules run from the sync worker, LiveRules and the screen: one change at a time. */
        val LOCK = Any()
    }
}
