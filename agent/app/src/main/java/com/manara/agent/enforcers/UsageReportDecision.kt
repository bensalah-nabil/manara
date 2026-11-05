package com.manara.agent.enforcers

/**
 * Pure decisions for the daily usage report, kept apart from [UsageReportEnforcer]'s Android I/O
 * so they can be unit-tested (same split as [TimeLimitDecision] and [TimeLimitEnforcer]).
 */
object UsageReportDecision {
    /** The busiest apps only: a report is an aggregate, not an inventory of everything installed. */
    const val MAX_APPS = 30

    /** At most one report an hour; the periodic worker runs about every 15 minutes. */
    const val MIN_GAP_MILLIS = 60L * 60 * 1000

    data class App(val packageName: String, val minutes: Long)

    data class Snapshot(val date: String, val totalMinutes: Long, val apps: List<App>)

    /** What was last reported, remembered across worker runs. */
    data class Last(val atMillis: Long, val date: String, val totalMinutes: Long)

    /** Apps with at least one whole minute, busiest first; [totalMinutes] counts every such app, not just the top [MAX_APPS]. */
    fun snapshot(minutesByPackage: Map<String, Long>, date: String): Snapshot {
        val used = minutesByPackage.filterValues { it > 0 }
        val apps = used.entries
            .sortedWith(compareByDescending<Map.Entry<String, Long>> { it.value }.thenBy { it.key })
            .take(MAX_APPS)
            .map { App(it.key, it.value) }
        return Snapshot(date, used.values.sum(), apps)
    }

    fun shouldReport(snapshot: Snapshot, last: Last?, nowMillis: Long): Boolean {
        if (last == null) return true
        // A negative gap means the clock moved back; treat that as "enough time has passed".
        val gap = nowMillis - last.atMillis
        if (gap in 0 until MIN_GAP_MILLIS) return false
        // An empty day after the first report says nothing new.
        if (snapshot.apps.isEmpty()) return false
        return !(snapshot.date == last.date && snapshot.totalMinutes == last.totalMinutes)
    }
}
