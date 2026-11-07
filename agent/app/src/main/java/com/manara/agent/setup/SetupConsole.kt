package com.manara.agent.setup

import com.manara.agent.sync.SetupInputDto

/**
 * Guided setup's link to the parent's console. Every input is typed there, so the phone can stay
 * on its Wireless debugging screen (ADR-0005); the phone only reads the input it is waiting for.
 */
interface SetupConsole {
    /** The name and password the console's QR code carries, made fresh for each setup. */
    val qr: PairingDecision.QrPairing

    /** What the parent typed; null while the server can't be reached, so setup simply keeps waiting. */
    suspend fun input(): SetupInputDto?

    /** Shows how pairing is going, on the phone's notice and in the console. */
    suspend fun pairingStatus(message: String)
}
