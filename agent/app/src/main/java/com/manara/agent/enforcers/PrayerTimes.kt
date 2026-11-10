package com.manara.agent.enforcers

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tan

/**
 * Pure prayer-time calculation, with no Android import, so it runs offline
 * from the cached policy (G5) and is unit-tested without a phone. Same split
 * as [LockDecision]: this file decides nothing about the phone.
 *
 * The method is the standard astronomical one (sun's declination and equation
 * of time from the low-precision formulas of the U.S. Naval Observatory, then
 * the hour angle for each sun altitude), as published by PrayTimes.org. The
 * code is written from the formulas, not copied (G3).
 *
 * Angles are the only thing that differs between countries. The defaults are
 * 18 degrees for both Fajr and Isha. Hypothesis, not yet checked: that this
 * matches the timetable of Tunisia's Ministry of Religious Affairs. The parent
 * can shift each prayer by a few minutes ([Settings.adjustMinutes]) to match
 * the local mosque.
 */
object PrayerTimes {

    enum class Prayer { FAJR, DHUHR, ASR, MAGHRIB, ISHA }

    data class Settings(
        val fajrAngle: Double = 18.0,
        val ishaAngle: Double = 18.0,
        /** 1 = an object's shadow equals its length (Maliki, Shafi'i, Hanbali); 2 = Hanafi. */
        val asrShadowFactor: Int = 1,
        /** Minutes added to a prayer, to match the local timetable. */
        val adjustMinutes: Map<Prayer, Int> = emptyMap()
    )

    /**
     * Minutes after local midnight for each prayer on the given civil date.
     * A prayer the sun never reaches that day (far north in summer) is left
     * out of the map rather than guessed.
     */
    fun forDay(
        year: Int,
        month: Int,
        day: Int,
        latitude: Double,
        longitude: Double,
        utcOffsetMinutes: Int,
        settings: Settings = Settings()
    ): Map<Prayer, Int> {
        val jd = julianDay(year, month, day) - longitude / (15.0 * 24.0)
        val tz = utcOffsetMinutes / 60.0

        fun noon(dayPortion: Double): Double {
            val sun = sunPosition(jd + dayPortion)
            return fixHour(12.0 - sun.equationOfTime) + tz - longitude / 15.0
        }

        /** Hours from noon until the sun is [altitude] degrees above the horizon, or NaN. */
        fun hourAngle(altitude: Double, dayPortion: Double): Double {
            val decl = sunPosition(jd + dayPortion).declination
            val x = (dsin(altitude) - dsin(latitude) * dsin(decl)) / (dcos(latitude) * dcos(decl))
            return if (x < -1.0 || x > 1.0) Double.NaN else dacos(x) / 15.0
        }

        fun asrAltitude(dayPortion: Double): Double {
            val decl = sunPosition(jd + dayPortion).declination
            return darccot(settings.asrShadowFactor + dtan(abs(latitude - decl)))
        }

        val hours = mapOf(
            Prayer.FAJR to noon(5.0 / 24) - hourAngle(-settings.fajrAngle, 5.0 / 24),
            Prayer.DHUHR to noon(12.0 / 24),
            Prayer.ASR to noon(13.0 / 24) + hourAngle(asrAltitude(13.0 / 24), 13.0 / 24),
            Prayer.MAGHRIB to noon(18.0 / 24) + hourAngle(-SUNSET_ANGLE, 18.0 / 24),
            Prayer.ISHA to noon(18.0 / 24) + hourAngle(-settings.ishaAngle, 18.0 / 24)
        )

        return hours
            .filterValues { !it.isNaN() }
            .mapValues { (prayer, hour) ->
                val minutes = (hour * 60.0).roundToInt() + (settings.adjustMinutes[prayer] ?: 0)
                Math.floorMod(minutes, MINUTES_PER_DAY)
            }
    }

    private class Sun(val declination: Double, val equationOfTime: Double)

    private fun sunPosition(julianDay: Double): Sun {
        val d = julianDay - 2451545.0
        val g = fixAngle(357.529 + 0.98560028 * d)
        val q = fixAngle(280.459 + 0.98564736 * d)
        val l = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g))
        val e = 23.439 - 0.00000036 * d
        val rightAscension = datan2(dcos(e) * dsin(l), dcos(l)) / 15.0
        return Sun(
            declination = dasin(dsin(e) * dsin(l)),
            equationOfTime = q / 15.0 - fixHour(rightAscension)
        )
    }

    /** Julian day at 00:00 UT of a Gregorian date. */
    private fun julianDay(year: Int, month: Int, day: Int): Double {
        var y = year
        var m = month
        if (m <= 2) {
            y -= 1
            m += 12
        }
        val a = floor(y / 100.0)
        val b = 2 - a + floor(a / 4.0)
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + day + b - 1524.5
    }

    /** Sun's centre this far below the horizon at sunrise and sunset: refraction plus its radius. */
    private const val SUNSET_ANGLE = 0.833
    const val MINUTES_PER_DAY = 24 * 60

    private fun fixAngle(a: Double) = a - 360.0 * floor(a / 360.0)
    private fun fixHour(h: Double) = h - 24.0 * floor(h / 24.0)
    private fun dsin(d: Double) = sin(Math.toRadians(d))
    private fun dcos(d: Double) = cos(Math.toRadians(d))
    private fun dtan(d: Double) = tan(Math.toRadians(d))
    private fun dasin(x: Double) = Math.toDegrees(asin(x))
    private fun dacos(x: Double) = Math.toDegrees(acos(x))
    private fun datan2(y: Double, x: Double) = Math.toDegrees(atan2(y, x))
    private fun darccot(x: Double) = Math.toDegrees(atan(1.0 / x))
}
