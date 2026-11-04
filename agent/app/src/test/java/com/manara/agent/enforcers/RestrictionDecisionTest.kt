package com.manara.agent.enforcers

import android.os.UserManager
import com.manara.agent.policy.Policy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RestrictionDecisionTest {

    private val vpn = UserManager.DISALLOW_CONFIG_VPN
    private val dns = UserManager.DISALLOW_CONFIG_PRIVATE_DNS
    private val reset = UserManager.DISALLOW_FACTORY_RESET

    @Test
    fun `default policy wants nothing`() {
        assertTrue(RestrictionDecision.desiredKeys(Policy.Restrictions(), 34).isEmpty())
    }

    @Test
    fun `private dns restriction is skipped below API 29`() {
        val r = Policy.Restrictions(blockPrivateDnsConfig = true, blockVpnConfig = true)
        assertEquals(setOf(vpn), RestrictionDecision.desiredKeys(r, 28))
        assertEquals(setOf(vpn, dns), RestrictionDecision.desiredKeys(r, 29))
    }

    @Test
    fun `adds only what is not already active`() {
        val d = RestrictionDecision.decide(desired = setOf(vpn, reset), previouslyApplied = emptySet(), currentlyActive = setOf(vpn))
        assertEquals(setOf(reset), d.toAdd)
        assertTrue(d.toClear.isEmpty())
        assertTrue(d.unexpectedlyMissing.isEmpty())
    }

    @Test
    fun `clears what Manara applied and no longer wants`() {
        val d = RestrictionDecision.decide(desired = emptySet(), previouslyApplied = setOf(vpn), currentlyActive = setOf(vpn))
        assertEquals(setOf(vpn), d.toClear)
    }

    @Test
    fun `never clears a restriction Manara did not apply`() {
        val d = RestrictionDecision.decide(desired = emptySet(), previouslyApplied = emptySet(), currentlyActive = setOf(reset))
        assertTrue(d.toClear.isEmpty())
    }

    @Test
    fun `reports and re-adds a restriction that disappeared`() {
        val d = RestrictionDecision.decide(desired = setOf(vpn), previouslyApplied = setOf(vpn), currentlyActive = emptySet())
        assertEquals(setOf(vpn), d.unexpectedlyMissing)
        assertEquals(setOf(vpn), d.toAdd)
    }

    @Test
    fun `first apply is not reported as missing`() {
        val d = RestrictionDecision.decide(desired = setOf(vpn), previouslyApplied = emptySet(), currentlyActive = emptySet())
        assertTrue(d.unexpectedlyMissing.isEmpty())
    }
}
