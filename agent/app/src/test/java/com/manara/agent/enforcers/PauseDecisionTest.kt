package com.manara.agent.enforcers

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class PauseDecisionTest {
    private val instagram = "com.instagram.android"
    private val tiktok = "com.zhiliaoapp.musically"
    private val firefox = "org.mozilla.firefox"

    @Test
    fun `an app reopens only when the last rule holding it lets go`() {
        // ADR-0009's example: Instagram over its daily limit when a prayer pause starts.
        var c = PauseDecision.hold(emptyMap(), "time-limit", setOf(instagram))
        c = PauseDecision.hold(c.holds, "prayer-pause", setOf(instagram, tiktok))
        assertEquals(setOf(instagram, tiktok), c.toPause)

        c = PauseDecision.hold(c.holds, "prayer-pause", emptySet())
        assertEquals("the pause ends: TikTok reopens, Instagram stays closed", setOf(tiktok), c.toResume)
        assertEquals(setOf(instagram), PauseDecision.paused(c.holds))

        c = PauseDecision.hold(c.holds, "time-limit", emptySet())
        assertEquals("the limit resets: now Instagram reopens", setOf(instagram), c.toResume)
        assertTrue(c.holds.isEmpty())
    }

    @Test
    fun `a rule replaces its whole set, and an app it drops reopens if nobody else holds it`() {
        var c = PauseDecision.hold(emptyMap(), "browser-block", setOf(firefox, "com.opera.browser"))
        c = PauseDecision.hold(c.holds, "browser-block", setOf(firefox))
        assertEquals(setOf("com.opera.browser"), c.toResume)
        assertEquals(setOf(firefox), c.toPause)
    }

    @Test
    fun `holding the same set again changes nothing and resumes nothing`() {
        val first = PauseDecision.hold(emptyMap(), "time-limit", setOf(instagram))
        val again = PauseDecision.hold(first.holds, "time-limit", setOf(instagram))
        assertEquals(first.holds, again.holds)
        assertTrue(again.toResume.isEmpty())
        assertEquals("re-paused, which heals an app reopened from elsewhere", setOf(instagram), again.toPause)
    }

    @Test
    fun `release reopens everything every rule held`() {
        var c = PauseDecision.hold(emptyMap(), "time-limit", setOf(instagram))
        c = PauseDecision.hold(c.holds, "browser-block", setOf(firefox))
        val released = PauseDecision.releaseAll(c.holds)
        assertEquals(setOf(instagram, firefox), released.toResume)
        assertTrue(released.holds.isEmpty() && released.toPause.isEmpty())
    }

    @Test
    fun `the reasons for an app are every rule holding it`() {
        var c = PauseDecision.hold(emptyMap(), "time-limit", setOf(instagram))
        c = PauseDecision.hold(c.holds, "prayer-pause", setOf(instagram))
        assertEquals(setOf("time-limit", "prayer-pause"), PauseDecision.reasons(c.holds, instagram))
        assertTrue(PauseDecision.reasons(c.holds, firefox).isEmpty())
    }

    @Test
    fun `a phone updated mid-pause keeps every app that was closed`() {
        val holds = PauseDecision.migrate(mapOf("time-limit" to setOf(instagram), "browser-block" to emptySet()))
        assertEquals(mapOf("time-limit" to setOf(instagram)), holds)
        // The browser rule, which held nothing, letting go later reopens nothing.
        assertTrue(PauseDecision.hold(holds, "browser-block", emptySet()).toResume.isEmpty())
    }

    /**
     * Random holds and releases from three rules, applied to a simulated phone: an app is never
     * reopened while a rule holds it, and the phone's paused apps always match the record.
     */
    @Test
    fun `random sequences never reopen an app a rule still holds`() {
        val rules = listOf("time-limit", "browser-block", "prayer-pause")
        val apps = listOf(instagram, tiktok, firefox, "com.whatsapp", "com.android.chrome")
        repeat(2_000) { seed ->
            val random = Random(seed)
            var holds = emptyMap<String, Set<String>>()
            val phone = mutableSetOf<String>()
            repeat(40) {
                val change = if (random.nextInt(20) == 0) {
                    PauseDecision.releaseAll(holds)
                } else {
                    PauseDecision.hold(holds, rules.random(random), apps.filter { random.nextBoolean() }.toSet())
                }
                for (app in change.toResume) {
                    assertFalse("seed $seed: $app reopened while held", app in PauseDecision.paused(change.holds))
                }
                phone += change.toPause
                phone -= change.toResume
                holds = change.holds
                assertEquals("seed $seed", PauseDecision.paused(holds), phone)
            }
        }
    }
}
