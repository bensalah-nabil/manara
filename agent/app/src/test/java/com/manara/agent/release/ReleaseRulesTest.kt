package com.manara.agent.release

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseRulesTest {
    private val rfcSecret = "12345678901234567890123456789012".toByteArray()

    /** RFC 6238 appendix B, SHA-256 column; the backend's test uses the same vectors. */
    @Test
    fun hotpMatchesRfc6238Sha256Vectors() {
        mapOf(
            59L to "46119246",
            1111111109L to "68084774",
            1111111111L to "67062674",
            1234567890L to "91819424",
            2000000000L to "90698825",
            20000000000L to "77737706",
        ).forEach { (unix, want) -> assertEquals("at $unix", want, ReleaseCode.hotp(rfcSecret, unix / 30)) }
    }

    private val step = ReleaseCode.STEP_SECONDS * 1000
    private val now = 1_800_000_000_000L
    private fun codeAt(millis: Long) = ReleaseCode.hotp(rfcSecret, millis / step)

    @Test
    fun currentAndNeighbouringStepsMatch() {
        assertTrue(ReleaseCode.matches(rfcSecret, codeAt(now), now))
        assertTrue(ReleaseCode.matches(rfcSecret, codeAt(now - step), now))
        assertTrue(ReleaseCode.matches(rfcSecret, codeAt(now + step), now))
    }

    @Test
    fun olderCodesAndMalformedInputDoNotMatch() {
        assertFalse(ReleaseCode.matches(rfcSecret, codeAt(now - 2 * step), now))
        assertFalse(ReleaseCode.matches(rfcSecret, "", now))
        assertFalse(ReleaseCode.matches(rfcSecret, codeAt(now).dropLast(1), now))
        assertFalse(ReleaseCode.matches("another secret, 32 bytes long!!".toByteArray(), codeAt(now), now))
    }

    @Test
    fun spacesAndDashesAreIgnored() {
        val code = codeAt(now)
        assertTrue(ReleaseCode.matches(rfcSecret, "${code.take(4)} - ${code.drop(4)}", now))
    }

    @Test
    fun fiveFreeTriesThenADoublingLock() {
        val hour = ReleaseAttempts.FIRST_LOCK_MILLIS
        assertNull(ReleaseAttempts.lockedUntil(4, now, now))
        assertEquals(now + hour, ReleaseAttempts.lockedUntil(5, now, now))
        assertEquals(now + 2 * hour, ReleaseAttempts.lockedUntil(6, now, now))
        assertEquals(now + 24 * hour, ReleaseAttempts.lockedUntil(40, now, now))
        assertNull(ReleaseAttempts.lockedUntil(5, now, now + hour))
    }

    @Test
    fun transferWindowOpensForThirtyMinutes() {
        val until = now + TransferWindow.LENGTH_MILLIS
        assertTrue(TransferWindow.isOpen(until, now))
        assertFalse(TransferWindow.isOpen(until, until))
        assertTrue(TransferWindow.hasExpired(until, until))
        assertFalse(TransferWindow.isOpen(null, now))
        assertFalse(TransferWindow.hasExpired(null, now))
    }

    @Test
    fun anEnrolledPhoneOnlyTakesANewCodeWhileItsParentHasOpenedAMove() {
        assertEquals(EnrollmentGate.Decision.ENROLL, EnrollmentGate.decide(enrolled = false, transferOpen = false))
        assertEquals(EnrollmentGate.Decision.MOVE, EnrollmentGate.decide(enrolled = true, transferOpen = true))
        assertEquals(EnrollmentGate.Decision.REFUSE, EnrollmentGate.decide(enrolled = true, transferOpen = false))
    }
}
