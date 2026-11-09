package com.manara.agent.enforcers

import com.manara.agent.enforcers.CallNotificationDecision.Call
import com.manara.agent.enforcers.CallNotificationDecision.Signal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallNotificationDecisionTest {
    private val d = CallNotificationDecision

    @Test
    fun `signals come from Android's call fields, not text`() {
        assertEquals(Signal.RINGING, d.signal(null, 1, ongoing = true, usesChronometer = false))
        assertEquals(Signal.IN_CALL, d.signal(null, 2, ongoing = true, usesChronometer = true))
        assertEquals(Signal.IN_CALL, d.signal("call", 0, ongoing = true, usesChronometer = true))
        assertEquals(Signal.RINGING, d.signal("call", 0, ongoing = true, usesChronometer = false))
        assertEquals(Signal.MISSED, d.signal("missed_call", 0, ongoing = false, usesChronometer = false))
        assertEquals(Signal.NONE, d.signal("msg", 0, ongoing = false, usesChronometer = false))
        assertEquals(Signal.NONE, d.signal(null, 0, ongoing = true, usesChronometer = true))
    }

    @Test
    fun `answered after ringing is incoming, timed from the answer`() {
        var open = d.posted("WhatsApp", null, Signal.RINGING, 1_000, null).open
        open = d.posted("WhatsApp", open, Signal.IN_CALL, 6_000, null).open
        open = d.posted("WhatsApp", open, Signal.IN_CALL, 30_000, null).open
        assertEquals(Call("WhatsApp", "incoming", 1_000, 60), d.removed("WhatsApp", open, 66_000))
    }

    @Test
    fun `in a call with no ringing first is outgoing`() {
        val open = d.posted("Telegram", null, Signal.IN_CALL, 10_000, null).open
        assertEquals(Call("Telegram", "outgoing", 10_000, 20), d.removed("Telegram", open, 30_500))
    }

    @Test
    fun `ringing that ends unanswered is missed`() {
        val open = d.posted("Messenger", null, Signal.RINGING, 5_000, null).open
        assertEquals(Call("Messenger", "missed", 5_000, 0), d.removed("Messenger", open, 25_000))
    }

    @Test
    fun `the app's own missed call notice counts once`() {
        assertEquals("missed", d.posted("Viber", null, Signal.MISSED, 100_000, null).call?.direction)
        assertNull(d.posted("Viber", null, Signal.MISSED, 150_000, lastMissedAt = 100_000).call)
        assertEquals("missed", d.posted("Viber", null, Signal.MISSED, 300_000, lastMissedAt = 100_000).call?.direction)
    }

    @Test
    fun `a removal with nothing open, or another notification, is no call`() {
        assertNull(d.removed("WhatsApp", null, 1_000))
        assertNull(d.posted("WhatsApp", null, Signal.NONE, 1_000, null).call)
    }

    @Test
    fun `every app has a name, and none is the phone app`() {
        assert(d.APPS.values.all { it.isNotBlank() })
        assert("com.android.phone" !in d.APPS)
    }
}
