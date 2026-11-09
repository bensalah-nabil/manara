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

        fun close(pkg: String, at: Long) {
            val since = openSince.remove(pkg) ?: return
            openActivities.remove(pkg)
            millis[pkg] = (millis[pkg] ?: 0L) + (at - since).coerceAtLeast(0L)
        }

        for (entry in entries.sortedBy { it.timeMillis }) {
            val pkg = entry.packageName
            when (entry.kind) {
                Kind.RESUMED -> {
                    seen += pkg
                    openSince.getOrPut(pkg) { entry.timeMillis.coerceAtLeast(dayStart) }
                    openActivities.getOrPut(pkg) { mutableSetOf() } += entry.className
                }
                Kind.PAUSED -> {
                    if (pkg !in seen) {
                        // Its first event today is a pause: it was already open at midnight.
                        millis[pkg] = (millis[pkg] ?: 0L) + (entry.timeMillis - dayStart).coerceAtLeast(0L)
                    } else {
                        val open = openActivities[pkg]
                        open?.remove(entry.className)
                        if (open.isNullOrEmpty()) close(pkg, entry.timeMillis)
                    }
                    seen += pkg
                }
                // A lost pause must not keep counting all night.
                Kind.SCREEN_OR_DEVICE_OFF -> openSince.keys.toList().forEach { close(it, entry.timeMillis) }
            }
        }
        openSince.keys.toList().forEach { close(it, now) }
        return millis.mapValues { it.value / 60_000 }
    }
}
