package com.manara.agent.enforcers

import android.content.Context
import com.manara.agent.events.Event
import com.manara.agent.events.EventKind
import com.manara.agent.policy.Policy
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Opt-in daily per-app minutes for the parent (capability-plan E3). This is data leaving the
 * device, so it only runs while `policy.usageReport.enabled`, and the managed notice and status
 * screen say so (G2). What to send and when is decided in [UsageReportDecision].
 *
 * Reads the same Usage Access data as [TimeLimitEnforcer]; without that permission it reports a
 * health problem instead of silently sending nothing.
 */
class UsageReportEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "usage-report"

    private val reader = DailyUsageReader(context)
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val health = HealthTracker(context, prefs, id)
    private val pendingEvents = mutableListOf<Event>()

    override fun apply(policy: Policy) {
        if (!policy.usageReport.enabled) {
            health.forget(CHECK_USAGE_ACCESS)
            // Re-enabling starts with an immediate report rather than waiting out the old gap.
            prefs.edit().clear().apply()
            return
        }
        val hasAccess = reader.hasAccess()
        health.observe(CHECK_USAGE_ACCESS, hasAccess)
        if (!hasAccess) return
        val minutes = reader.readMinutes() ?: return

        val now = System.currentTimeMillis()
        val snapshot = UsageReportDecision.snapshot(minutes, LocalDate.now().toString())
        if (!UsageReportDecision.shouldReport(snapshot, last(), now)) return

        pendingEvents.add(toEvent(snapshot))
        prefs.edit()
            .putLong(KEY_AT, now)
            .putString(KEY_DATE, snapshot.date)
            .putLong(KEY_TOTAL, snapshot.totalMinutes)
            .apply()
    }

    override fun collectEvents(): List<Event> {
        val events = pendingEvents.toList()
        pendingEvents.clear()
        return events
    }

    private fun last(): UsageReportDecision.Last? {
        val date = prefs.getString(KEY_DATE, null) ?: return null
        return UsageReportDecision.Last(prefs.getLong(KEY_AT, 0L), date, prefs.getLong(KEY_TOTAL, 0L))
    }

    private fun toEvent(snapshot: UsageReportDecision.Snapshot) = Event(
        id = UUID.randomUUID().toString(),
        kind = EventKind.usage_report,
        occurredAt = Instant.now().toString(),
        payload = JsonObject(
            mapOf(
                "date" to JsonPrimitive(snapshot.date),
                "totalMinutes" to JsonPrimitive(snapshot.totalMinutes),
                "apps" to JsonArray(
                    snapshot.apps.map {
                        JsonObject(mapOf("package" to JsonPrimitive(it.packageName), "minutes" to JsonPrimitive(it.minutes)))
                    }
                )
            )
        )
    )

    private companion object {
        const val PREFS_NAME = "usage_report_enforcer"
        const val KEY_AT = "last_at"
        const val KEY_DATE = "last_date"
        const val KEY_TOTAL = "last_total"
        const val CHECK_USAGE_ACCESS = "usage_access"
    }
}
