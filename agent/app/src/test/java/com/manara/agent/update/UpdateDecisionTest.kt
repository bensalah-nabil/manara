package com.manara.agent.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class UpdateDecisionTest {
    private val sum = "f886171e62f38f747435fab6b6cbc9813af85780348b54c5e05208ed69a1a025"
    private val offer = UpdateOffer(32, "1.0.32", UpdateDecision.RELEASES_URL + "v1.0.32/manara.apk", sum)

    private fun wait(
        offer: UpdateOffer? = this.offer,
        installed: Int = 31,
        selfUpdate: Boolean = true,
        owner: Boolean = true,
        setup: Boolean = false,
        releasing: Boolean = false,
        tries: Int = 0,
    ) = UpdateDecision.reasonToWait(offer, installed, selfUpdate, owner, setup, releasing, tries)

    @Test fun `a newer offered version is installed`() = assertNull(wait())

    @Test fun `the same or an older version is left alone`() {
        assertNotNull(wait(installed = 32))
        assertNotNull(wait(installed = 40))
    }

    @Test fun `nothing happens while updates are held back`() = assertNotNull(wait(offer = null))

    @Test fun `the Play build never updates itself`() = assertNotNull(wait(selfUpdate = false))

    @Test fun `without device owner the child would be asked, so it waits`() = assertNotNull(wait(owner = false))

    @Test fun `never during guided setup or a release`() {
        assertNotNull(wait(setup = true))
        assertNotNull(wait(releasing = true))
    }

    @Test fun `only Manara's own releases are fetched`() {
        assertNotNull(wait(offer = offer.copy(url = "https://example.org/manara.apk")))
        assertNotNull(wait(offer = offer.copy(url = "http://github.com/bensalah-nabil/manara/releases/download/v1.0.32/manara.apk")))
        assertNotNull(wait(offer = offer.copy(url = "https://github.com/someone/manara/releases/download/v1.0.32/manara.apk")))
    }

    @Test fun `a malformed checksum is refused`() {
        assertNotNull(wait(offer = offer.copy(sha256 = sum.uppercase())))
        assertNotNull(wait(offer = offer.copy(sha256 = "")))
    }

    @Test fun `it gives up on a version after three failures, not on the next one`() {
        assertNull(wait(tries = 2))
        assertNotNull(wait(tries = 3))
        // Tries are counted per version: the store resets them when a newer one is offered.
        assertNull(wait(offer = offer.copy(versionCode = 33), tries = 0))
    }

    private fun problem(sha: String = sum, pkg: String? = "com.manara.agent", code: Long? = 32) =
        UpdateDecision.problemWithDownload(offer, sha, pkg, code, "com.manara.agent")

    @Test fun `only the exact offered file is installed`() {
        assertNull(problem())
        assertEquals("checksum does not match", problem(sha = "0".repeat(64)))
        assertNotNull(problem(pkg = "com.example.other"))
        assertNotNull(problem(pkg = null))
        assertNotNull(problem(code = 31))
        assertNotNull(problem(code = null))
    }
}
