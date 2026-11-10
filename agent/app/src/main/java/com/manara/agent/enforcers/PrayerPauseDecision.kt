package com.manara.agent.enforcers

import com.manara.agent.enforcers.PrayerTimes.Prayer

/**
 * Pure "is now inside a prayer pause" check. The pause is a short break from
 * the apps the parent already limits (social media, games), starting at each
 * prayer the parent ticked. It is not a lock: the phone, calls and every other
 * app stay usable, so the child can always reach the parent.
 *
 * Nothing here touches the phone. The enforcer that suspends and resumes the
 * apps, the policy field and the child's notice are separate steps (roadmap
 * P14), not built yet.
 */
object PrayerPauseDecision {

    data class Pause(val prayer: Prayer, val startMinute: Int, val endMinute: Int)

    /**
     * The pause that covers [nowMinute] (minutes after local midnight), or null.
     * [times] is today's [PrayerTimes.forDay]. A pause that started before
     * midnight still counts just after it.
     */
    fun activePause(
        times: Map<Prayer, Int>,
        prayers: Set<Prayer>,
        pauseMinutes: Int,
        nowMinute: Int
    ): Pause? {
        if (pauseMinutes <= 0) return null
        return times.entries
            .filter { it.key in prayers }
            .sortedBy { it.value }
            .firstNotNullOfOrNull { (prayer, start) ->
                val end = start + pauseMinutes
                val inside = nowMinute in start until end ||
                    nowMinute + PrayerTimes.MINUTES_PER_DAY in start until end
                if (inside) Pause(prayer, start, end % PrayerTimes.MINUTES_PER_DAY) else null
            }
    }

    /** The next ticked prayer later today, for the child's status screen, or null after the last one. */
    fun nextPause(times: Map<Prayer, Int>, prayers: Set<Prayer>, nowMinute: Int): Pair<Prayer, Int>? =
        times.entries
            .filter { it.key in prayers && it.value > nowMinute }
            .minByOrNull { it.value }
            ?.toPair()
}
