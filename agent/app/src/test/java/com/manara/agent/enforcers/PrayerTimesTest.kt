package com.manara.agent.enforcers

import com.manara.agent.enforcers.PrayerTimes.Prayer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class PrayerTimesTest {

    // Tunis, UTC+1 all year (Tunisia has no summer time).
    private val lat = 36.8065
    private val lng = 10.1815
    private val utcPlusOne = 60

    private fun minutes(h: Int, m: Int) = h * 60 + m

    /** Within a minute of the reference: rounding differs between implementations. */
    private fun assertNear(expected: Int, actual: Int?, what: String) {
        assertTrue("$what: expected about $expected, got $actual", actual != null && abs(expected - actual) <= 1)
    }

    // Reference values: the PrayTimes.org library (praytimes 2.3.2), Fajr and
    // Isha at 18 degrees, standard Asr, computed 2026-11-10. Sunset there
    // (17:14) also matches Maghrib here, which is sunset.
    @Test
    fun `Tunis in November matches the reference`() {
        val t = PrayerTimes.forDay(2026, 11, 10, lat, lng, utcPlusOne)
        assertNear(minutes(5, 23), t[Prayer.FAJR], "Fajr")
        assertNear(minutes(12, 3), t[Prayer.DHUHR], "Dhuhr")
        assertNear(minutes(14, 53), t[Prayer.ASR], "Asr")
        assertNear(minutes(17, 14), t[Prayer.MAGHRIB], "Maghrib")
        assertNear(minutes(18, 43), t[Prayer.ISHA], "Isha")
    }

    @Test
    fun `Tunis on the longest day matches the reference`() {
        val t = PrayerTimes.forDay(2026, 6, 21, lat, lng, utcPlusOne)
        assertNear(minutes(3, 8), t[Prayer.FAJR], "Fajr")
        assertNear(minutes(12, 21), t[Prayer.DHUHR], "Dhuhr")
        assertNear(minutes(16, 13), t[Prayer.ASR], "Asr")
        assertNear(minutes(19, 42), t[Prayer.MAGHRIB], "Maghrib")
        assertNear(minutes(21, 34), t[Prayer.ISHA], "Isha")
    }

    @Test
    fun `Tunis in February, a January-February date exercises the year roll-back`() {
        val t = PrayerTimes.forDay(2027, 2, 10, lat, lng, utcPlusOne)
        assertNear(minutes(5, 46), t[Prayer.FAJR], "Fajr")
        assertNear(minutes(12, 33), t[Prayer.DHUHR], "Dhuhr")
        assertNear(minutes(15, 30), t[Prayer.ASR], "Asr")
        assertNear(minutes(17, 54), t[Prayer.MAGHRIB], "Maghrib")
        assertNear(minutes(19, 21), t[Prayer.ISHA], "Isha")
    }

    @Test
    fun `prayers come in order through the day`() {
        val t = PrayerTimes.forDay(2026, 11, 10, lat, lng, utcPlusOne)
        val inOrder = Prayer.values().map { t.getValue(it) }
        assertEquals(inOrder.sorted(), inOrder)
    }

    @Test
    fun `the parent's adjustment shifts one prayer only`() {
        val base = PrayerTimes.forDay(2026, 11, 10, lat, lng, utcPlusOne)
        val shifted = PrayerTimes.forDay(
            2026, 11, 10, lat, lng, utcPlusOne,
            PrayerTimes.Settings(adjustMinutes = mapOf(Prayer.DHUHR to 7))
        )
        assertEquals(base.getValue(Prayer.DHUHR) + 7, shifted.getValue(Prayer.DHUHR))
        assertEquals(base.getValue(Prayer.ASR), shifted.getValue(Prayer.ASR))
    }

    @Test
    fun `Hanafi Asr is later than the standard one`() {
        val standard = PrayerTimes.forDay(2026, 11, 10, lat, lng, utcPlusOne)
        val hanafi = PrayerTimes.forDay(2026, 11, 10, lat, lng, utcPlusOne, PrayerTimes.Settings(asrShadowFactor = 2))
        assertTrue(hanafi.getValue(Prayer.ASR) > standard.getValue(Prayer.ASR))
    }

    @Test
    fun `where the sun never sets, the missing prayers are left out, not guessed`() {
        // Tromso, Norway, midsummer: no sunset and no 18-degree twilight.
        val t = PrayerTimes.forDay(2026, 6, 21, 69.65, 18.96, 120)
        assertFalse(Prayer.FAJR in t)
        assertFalse(Prayer.MAGHRIB in t)
        assertFalse(Prayer.ISHA in t)
        assertTrue(Prayer.DHUHR in t)
    }
}
