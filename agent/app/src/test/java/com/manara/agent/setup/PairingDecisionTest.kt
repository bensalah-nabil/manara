package com.manara.agent.setup

import com.manara.agent.setup.PairingDecision.Code
import com.manara.agent.setup.PairingDecision.Next
import com.manara.agent.setup.PairingDecision.Service
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class PairingDecisionTest {
    private val qr = "manara-ab12cd"
    private val codeScreen = Service("adb-R92TB0RPVPL-wx9F8O", 38381)

    @Test
    fun `nothing open and no code means wait`() {
        assertEquals(Next.Wait, PairingDecision.next(emptyList(), qr, null, emptySet()))
        // The pairing-code screen alone does nothing until the parent sends its code.
        assertEquals(Next.Wait, PairingDecision.next(listOf(codeScreen), qr, null, emptySet()))
    }

    @Test
    fun `a scanned QR code pairs with its own port, once`() {
        val scanned = listOf(Service(qr, 41000))
        assertEquals(Next.PairWithQr(41000), PairingDecision.next(scanned, qr, null, emptySet()))
        assertEquals(Next.Wait, PairingDecision.next(scanned, qr, null, setOf(41000)))
        // A new scan opens a new port.
        assertEquals(Next.PairWithQr(42000), PairingDecision.next(listOf(Service(qr, 42000)), qr, null, setOf(41000)))
    }

    @Test
    fun `another phone's QR name is not ours`() {
        assertEquals(Next.Wait, PairingDecision.next(listOf(Service("manara-zz99zz", 41000)), qr, null, emptySet()))
    }

    @Test
    fun `a code goes to the pairing-code screen, not the QR one`() {
        val code = Code("654321", 3)
        assertEquals(Next.PairWithCode(38381, code), PairingDecision.next(listOf(Service(qr, 41000), codeScreen), qr, code, setOf(41000)))
        assertEquals(Next.PairWithCode(38381, code), PairingDecision.next(listOf(codeScreen), qr, code, emptySet()))
    }

    @Test
    fun `a code with no pairing-code screen open says so`() {
        val code = Code("654321", 3)
        assertEquals(Next.NoCodeScreen(code), PairingDecision.next(emptyList(), qr, code, emptySet()))
    }

    @Test
    fun `each console code is tried once, even the same digits sent again`() {
        assertEquals(Code("654321", 2), PairingDecision.newCode("654321", seq = 2, lastSeq = 1))
        assertNull(PairingDecision.newCode("654321", seq = 2, lastSeq = 2))
        assertNull(PairingDecision.newCode(null, seq = 5, lastSeq = 1))
        assertNull(PairingDecision.newCode("12345", seq = 5, lastSeq = 1))
    }

    @Test
    fun `QR credentials fit the QR format and the server's check`() {
        val pairing = PairingDecision.newQrPairing(Random(7))
        assertTrue(pairing.name, Regex("^manara-[a-z0-9]{4,16}$").matches(pairing.name))
        assertTrue(pairing.password, Regex("^[A-Za-z0-9]{8,32}$").matches(pairing.password))
        assertEquals("WIFI:T:ADB;S:${pairing.name};P:${pairing.password};;", pairing.qrText)
        assertNotEquals(pairing, PairingDecision.newQrPairing(Random(8)))
    }
}
