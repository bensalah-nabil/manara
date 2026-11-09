package com.manara.agent.enforcers

/**
 * Pure: today's foreground minutes per app, from Android's usage events.
 *
 * `queryUsageStats` returns stored totals and does not add a session still running (AOSP
 * `UserUsageStatsService.queryStats`), so someone who stays inside one app would never reach a
 * limit. Counting from the events includes the running session.
 */
object UsageSessions {
    enum class Kind { RESUMED, PAUSED, SCREEN_OR_DEVICE_OFF }

    data class Entry(val packageName: String, val className: String?, val kind: Kind, val timeMillis: Long)

    fun minutes(entries: Iterable<Entry>, dayStart: Long, now: Long): Map<String, Long> {
        val millis = mutableMapOf<String, Long>()
        val openSince = mutableMapOf<String, Long>()
        val openActivities = mutableMapOf<String, MutableSet<String?>>()
        val seen = mutableSetOf<String>()
        var foregroundChanged = false

        fun close(pkg: String, at: Long) {
            val since = openSince.remove(pkg) ?: return
            openActivities.remove(pkg)
            millis[pkg] = (millis[pkg] ?: 0L) + (at - since).coerceAtLeast(0L)
        }

        for (entry in entries.sortedBy { it.timeMillis }) {
            val pkg = entry.packageName
            when (entry.kind) {
                Kind.RESUMED -> {
                    // Android doesn't report a pause for every screen (SM-A528B: Facebook stayed
                    // "open" after its last pause, 9 minutes too many). Another app in front means
                    // this one has left. In split screen this undercounts rather than blocks early.
                    (openSince.keys - pkg).forEach { close(it, entry.timeMillis) }
                    foregroundChanged = true
                    seen += pkg
                    openSince.getOrPut(pkg) { entry.timeMillis.coerceAtLeast(dayStart) }
                    openActivities.getOrPut(pkg) { mutableSetOf() } += entry.className
                }
                Kind.PAUSED -> {
                    if (pkg !in seen && !foregroundChanged) {
                        // Nothing else has come to the front today, so it was open at midnight.
                        // Any later, a lone pause says nothing (SM-A528B: 7 hours for Settings).
                        millis[pkg] = (millis[pkg] ?: 0L) + (entry.timeMillis - dayStart).coerceAtLeast(0L)
                    } else {
                        val open = openActivities[pkg]
                        open?.remove(entry.className)
                        if (open.isNullOrEmpty()) close(pkg, entry.timeMillis)
                    }
                    seen += pkg
                }
                // A lost pause must not keep counting all night.
                Kind.SCREEN_OR_DEVICE_OFF -> {
                    openSince.keys.toList().forEach { close(it, entry.timeMillis) }
                    foregroundChanged = true
                }
            }
        }
        openSince.keys.toList().forEach { close(it, now) }
        return millis.mapValues { it.value / 60_000 }
    }
}
