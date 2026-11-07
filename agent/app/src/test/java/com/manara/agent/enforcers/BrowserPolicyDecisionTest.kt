package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import com.manara.agent.ui.ChildView
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserPolicyDecisionTest {

    @Test
    fun `default policy leaves Chrome alone`() {
        assertTrue(BrowserPolicyDecision.restrictions(Policy.Browser()).isEmpty())
        assertNull(ChildView.browserRules(Policy.Browser()))
    }

    @Test
    fun `every rule maps to Chrome's own policy name and type`() {
        val map = BrowserPolicyDecision.restrictions(
            Policy.Browser(safeSearch = true, youtube = "strict", secureDnsOff = true, blockedSites = listOf("example.com"))
        )
        assertEquals(true, map["ForceGoogleSafeSearch"])
        assertEquals(2, map["ForceYouTubeRestrict"])
        assertEquals("off", map["DnsOverHttpsMode"])
        assertArrayEquals(arrayOf("example.com"), map["URLBlocklist"] as Array<*>)
        assertEquals(4, map.size)
    }

    @Test
    fun `an unknown YouTube mode never turns a restriction on`() {
        assertEquals(1, BrowserPolicyDecision.youtubeLevel("moderate"))
        assertNull(BrowserPolicyDecision.youtubeLevel("off"))
        assertNull(BrowserPolicyDecision.youtubeLevel("STRICT"))
        assertFalse("ForceYouTubeRestrict" in BrowserPolicyDecision.restrictions(Policy.Browser(youtube = "lenient")))
    }

    @Test
    fun `sites are cleaned, deduplicated and capped`() {
        assertEquals(
            listOf("example.com", "bad.example"),
            BrowserPolicyDecision.sites(listOf(" Example.com/ ", "example.com", "", "has space.com", "bad.example"))
        )
        val many = (1..300).map { "s$it.example" }
        assertEquals(BrowserPolicyDecision.MAX_SITES, BrowserPolicyDecision.sites(many).size)
    }

    @Test
    fun `an unchanged configuration is recognised, arrays by content`() {
        val desired = BrowserPolicyDecision.restrictions(Policy.Browser(safeSearch = true, blockedSites = listOf("a.example")))
        assertTrue(BrowserPolicyDecision.same(mapOf("ForceGoogleSafeSearch" to true, "URLBlocklist" to arrayOf("a.example")), desired))
        assertFalse(BrowserPolicyDecision.same(mapOf("ForceGoogleSafeSearch" to true, "URLBlocklist" to arrayOf("b.example")), desired))
        assertFalse(BrowserPolicyDecision.same(mapOf("ForceGoogleSafeSearch" to true), desired))
        assertTrue(BrowserPolicyDecision.same(emptyMap(), emptyMap()))
    }

    @Test
    fun `the child is told every Chrome rule`() {
        val text = ChildView.browserRules(Policy.Browser(safeSearch = true, youtube = "moderate", secureDnsOff = true, blockedSites = listOf("a.example", "b.example")))
        assertEquals(
            "SafeSearch on Google. YouTube Restricted Mode. Chrome's own secure DNS is off, so the website filter applies. 2 websites blocked.",
            text
        )
    }
}
