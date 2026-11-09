package com.manara.agent.enforcers

import org.junit.Assert.assertEquals
import org.junit.Test

class BrowserBlockDecisionTest {
    private val chrome = BrowserPolicyDecision.CHROME

    @Test
    fun `every browser but Chrome is blocked`() {
        val result = BrowserBlockDecision.decide(true, setOf(chrome, "sbrowser", "firefox"), emptySet())
        assertEquals(setOf("sbrowser", "firefox"), result.toBlock)
        assertEquals(emptySet<String>(), result.toResume)
    }

    @Test
    fun `a browser Android stops listing stays blocked`() {
        val result = BrowserBlockDecision.decide(true, setOf(chrome), setOf("sbrowser"))
        assertEquals(setOf("sbrowser"), result.toBlock)
    }

    @Test
    fun `turning the rule off resumes everything it blocked`() {
        val result = BrowserBlockDecision.decide(false, setOf(chrome, "firefox"), setOf("sbrowser"))
        assertEquals(emptySet<String>(), result.toBlock)
        assertEquals(setOf("sbrowser"), result.toResume)
    }

    @Test
    fun `system essentials and Manara are never blocked`() {
        val result = BrowserBlockDecision.decide(true, setOf("android", "com.android.settings", "com.manara.agent"), emptySet())
        assertEquals(emptySet<String>(), result.toBlock)
    }
}
