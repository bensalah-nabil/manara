package com.manara.agent.enforcers

import com.manara.agent.enforcers.UsageSessions.Entry
import com.manara.agent.enforcers.UsageSessions.Kind.PAUSED
import com.manara.agent.enforcers.UsageSessions.Kind.RESUMED
import com.manara.agent.enforcers.UsageSessions.Kind.SCREEN_OR_DEVICE_OFF
import org.junit.Assert.assertEquals
import org.junit.Test

class UsageSessionsTest {
    private val day = 1_000_000_000L
    private fun min(n: Long) = day + n * 60_000
    private fun e(pkg: String, kind: UsageSessions.Kind, at: Long, cls: String? = "A") = Entry(pkg, cls, kind, at)

    @Test
    fun `a session still running counts up to now`() {
        val result = UsageSessions.minutes(listOf(e("tiktok", RESUMED, min(10))), day, min(55))
        assertEquals(45L, result["tiktok"])
    }

    @Test
    fun `closed sessions add up`() {
        val result = UsageSessions.minutes(
            listOf(e("fb", RESUMED, min(0)), e("fb", PAUSED, min(5)), e("fb", RESUMED, min(10)), e("fb", PAUSED, min(13))),
            day, min(60),
        )
        assertEquals(8L, result["fb"])
    }

    @Test
    fun `moving between screens of one app is one session`() {
        val result = UsageSessions.minutes(
            listOf(e("ig", RESUMED, min(0), "A"), e("ig", RESUMED, min(2), "B"), e("ig", PAUSED, min(2), "A"), e("ig", PAUSED, min(7), "B")),
            day, min(60),
        )
        assertEquals(7L, result["ig"])
    }

    @Test
    fun `an app open across midnight counts from midnight, once`() {
        val result = UsageSessions.minutes(
            listOf(e("ig", PAUSED, min(4)), e("ig", RESUMED, min(10)), e("ig", PAUSED, min(11))),
            day, min(60),
        )
        assertEquals(5L, result["ig"])
    }

    @Test
    fun `screen off stops the count even when the pause is lost, and a late pause adds nothing`() {
        val lost = UsageSessions.minutes(listOf(e("fb", RESUMED, min(0)), e("android", SCREEN_OR_DEVICE_OFF, min(3))), day, min(500))
        assertEquals(3L, lost["fb"])
        val late = UsageSessions.minutes(
            listOf(e("fb", RESUMED, min(0)), e("android", SCREEN_OR_DEVICE_OFF, min(3)), e("fb", PAUSED, min(3) + 500)),
            day, min(500),
        )
        assertEquals(3L, late["fb"])
    }

    @Test
    fun `out of order input is sorted and whole minutes round down`() {
        val result = UsageSessions.minutes(listOf(e("fb", PAUSED, min(2) + 59_000), e("fb", RESUMED, min(0))), day, min(60))
        assertEquals(2L, result["fb"])
    }
}
