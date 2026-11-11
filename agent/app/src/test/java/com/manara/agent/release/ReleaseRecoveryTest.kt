package com.manara.agent.release

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseRecoveryTest {
    private fun finish(releasing: Boolean = false, deviceOwner: Boolean = true, hasToken: Boolean = true, hasPolicy: Boolean = true, serverRefused: Boolean = false) =
        ReleaseRecovery.shouldFinish(releasing, deviceOwner, hasToken, hasPolicy, serverRefused)

    @Test
    fun aReleaseThatStartedIsFinished() {
        assertTrue(finish(releasing = true))
        // Cut off after the token was forgotten, or after the rules were deleted: still finished.
        assertTrue(finish(releasing = true, hasToken = false, hasPolicy = false))
    }

    @Test
    fun thePhoneStuckOnTheA52IsFinished() {
        // Device Owner, rules deleted by the release, token refused by the server.
        assertTrue(finish(hasPolicy = false, serverRefused = true))
    }

    @Test
    fun aServerProblemNeverReleasesAPhone() {
        // Tokens lost or the server confused: the phone still has its rules, so it stays managed.
        assertFalse(finish(serverRefused = true))
    }

    @Test
    fun aPhoneJustEnrolledIsNotReleased() {
        // Its first rules haven't been saved yet, but the server knows it.
        assertFalse(finish(hasPolicy = false, serverRefused = false))
    }

    @Test
    fun aPhoneNoLongerManagedHasNothingToFinish() {
        assertFalse(finish(releasing = true, deviceOwner = false))
        assertFalse(finish(deviceOwner = false, hasPolicy = false, serverRefused = true))
    }
}
