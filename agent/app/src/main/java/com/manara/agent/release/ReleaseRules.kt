package com.manara.agent.release

import java.nio.ByteBuffer
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Pure. The phone's side of a parent's release (backend `domain/release.go`):
 * the same one-time code, checked here from the secret received at enrollment,
 * so it works with no connection at all.
 */
object ReleaseCode {
    const val DIGITS = 8
    const val STEP_SECONDS = 600L

    /** RFC 4226 with HMAC-SHA256, as RFC 6238 allows. */
    fun hotp(secret: ByteArray, counter: Long, digits: Int = DIGITS): String {
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret, "HmacSHA256")) }
        val sum = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array())
        val offset = sum.last().toInt() and 0x0f
        val value = ByteBuffer.wrap(sum, offset, 4).int and 0x7fffffff
        var mod = 1
        repeat(digits) { mod *= 10 }
        return (value % mod).toString().padStart(digits, '0')
    }

    /** Digits only: spaces and dashes a parent may type are ignored. */
    fun normalize(typed: String): String = typed.filter { it.isDigit() }

    /** The code of the current step, or of the one before or after (clock drift). */
    fun matches(secret: ByteArray, typed: String, nowMillis: Long): Boolean {
        val code = normalize(typed)
        if (code.length != DIGITS) return false
        val counter = nowMillis / 1000 / STEP_SECONDS
        return (counter - 1..counter + 1).any {
            MessageDigest.isEqual(hotp(secret, it).toByteArray(), code.toByteArray())
        }
    }
}

/**
 * Pure. Wrong release codes lock the screen for a while, doubling each time:
 * 10^8 codes cannot be guessed at five tries an hour.
 */
object ReleaseAttempts {
    const val FREE_TRIES = 5
    const val FIRST_LOCK_MILLIS = 60 * 60 * 1000L
    const val MAX_LOCK_MILLIS = 24 * FIRST_LOCK_MILLIS

    /** When the next try is allowed, or null when it is allowed now. */
    fun lockedUntil(failures: Int, lastFailureAt: Long, nowMillis: Long): Long? {
        if (failures < FREE_TRIES) return null
        val doublings = (failures - FREE_TRIES).coerceAtMost(5)
        val lock = (FIRST_LOCK_MILLIS shl doublings).coerceAtMost(MAX_LOCK_MILLIS)
        val until = lastFailureAt + lock
        return until.takeIf { it > nowMillis }
    }
}

/**
 * Pure. A parent moving the phone to another account opens a window in which
 * it accepts one new connection code. The current account stays in charge
 * until the new one has taken over; if the window closes first, nothing changes.
 */
object TransferWindow {
    const val LENGTH_MILLIS = 30 * 60 * 1000L

    fun isOpen(openUntil: Long?, nowMillis: Long): Boolean = openUntil != null && nowMillis < openUntil

    fun hasExpired(openUntil: Long?, nowMillis: Long): Boolean = openUntil != null && nowMillis >= openUntil
}

/** Pure. What a phone may do with a new connection code. */
object EnrollmentGate {
    enum class Decision { ENROLL, MOVE, REFUSE }

    fun decide(enrolled: Boolean, transferOpen: Boolean): Decision = when {
        !enrolled -> Decision.ENROLL
        transferOpen -> Decision.MOVE
        else -> Decision.REFUSE
    }
}
