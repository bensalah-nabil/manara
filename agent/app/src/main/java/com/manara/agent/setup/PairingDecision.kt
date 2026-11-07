package com.manara.agent.setup

import java.security.SecureRandom

/**
 * Pure. How guided setup pairs with the phone's own wireless debugging while every input is
 * typed in the parent's console, so the phone can stay on its Wireless debugging screen (ADR-0005):
 *
 * - **QR code:** the console shows [QrPairing.qrText]. "Pair device with QR code" reads it and
 *   advertises a pairing service under [QrPairing.name] (AOSP AdbDebuggingManager), so seeing
 *   that name means the phone scanned it, and its password pairs.
 * - **Pairing code:** "Pair device with pairing code" advertises a service under the phone's own
 *   name and shows six digits, which the parent types in the console.
 */
object PairingDecision {

    /** A `_adb-tls-pairing._tcp` service found on this phone's own address. */
    data class Service(val name: String, val port: Int)

    /** A code from the console the phone hasn't tried yet; [seq] numbers it. */
    data class Code(val code: String, val seq: Int)

    sealed interface Next {
        data class PairWithQr(val port: Int) : Next
        data class PairWithCode(val port: Int, val code: Code) : Next
        /** A code arrived, but no pairing-code screen is open to use it with. */
        data class NoCodeScreen(val code: Code) : Next
        data object Wait : Next
    }

    /**
     * [triedQrPorts]: a QR service is tried once per port; a scan that failed must be redone,
     * which opens a new port. A code is used with the first pairing service that isn't the QR one.
     */
    fun next(services: List<Service>, qrName: String, code: Code?, triedQrPorts: Set<Int>): Next {
        services.firstOrNull { it.name == qrName && it.port !in triedQrPorts }?.let { return Next.PairWithQr(it.port) }
        if (code == null) return Next.Wait
        val codeScreen = services.firstOrNull { it.name != qrName } ?: return Next.NoCodeScreen(code)
        return Next.PairWithCode(codeScreen.port, code)
    }

    /** The console's input, as the phone reads it; a code counts only if it is newer than [lastSeq]. */
    fun newCode(code: String?, seq: Int, lastSeq: Int): Code? =
        if (code != null && SetupInput.isPairingCode(code) && seq > lastSeq) Code(code, seq) else null

    data class QrPairing(val name: String, val password: String) {
        /** What Android's QR scanner reads (AOSP Settings AdbQrcodeScannerFragment). */
        val qrText: String get() = "WIFI:T:ADB;S:$name;P:$password;;"
    }

    // Letters and digits only: ';', ':' and ',' have meanings in the QR format. Matches the server's check.
    private const val NAME_CHARS = "abcdefghijkmnpqrstuvwxyz23456789"
    private const val PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

    fun newQrPairing(random: java.util.Random = SecureRandom()): QrPairing {
        fun pick(chars: String, n: Int) = String(CharArray(n) { chars[random.nextInt(chars.length)] })
        return QrPairing(name = "manara-" + pick(NAME_CHARS, 6), password = pick(PASSWORD_CHARS, 16))
    }
}
