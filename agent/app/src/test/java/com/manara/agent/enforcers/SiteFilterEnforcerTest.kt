package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SiteFilterEnforcerTest {
    @Test
    fun `matching host in strict mode is healthy`() {
        assertTrue(SiteFilterEnforcer.isHostPinned(
            DevicePolicyManager.PRIVATE_DNS_MODE_PROVIDER_HOSTNAME, "dns.google", "dns.google"
        ))
    }

    @Test
    fun `retained host in opportunistic mode is unhealthy`() {
        assertFalse(SiteFilterEnforcer.isHostPinned(
            DevicePolicyManager.PRIVATE_DNS_MODE_OPPORTUNISTIC, "dns.google", "dns.google"
        ))
    }

    @Test
    fun `retained host when off or unknown is unhealthy`() {
        for (mode in listOf(
            DevicePolicyManager.PRIVATE_DNS_MODE_OFF,
            DevicePolicyManager.PRIVATE_DNS_MODE_UNKNOWN
        )) {
            assertFalse(SiteFilterEnforcer.isHostPinned(mode, "dns.google", "dns.google"))
        }
    }

    @Test
    fun `different or missing host in strict mode is unhealthy`() {
        for (host in listOf("one.one.one.one", null)) {
            assertFalse(SiteFilterEnforcer.isHostPinned(
                DevicePolicyManager.PRIVATE_DNS_MODE_PROVIDER_HOSTNAME, host, "dns.google"
            ))
        }
    }

    @Test
    fun `a working host clears the failures reported before, and once the one older versions left`() {
        assertEquals(listOf("host_not_serving"), SiteFilterEnforcer.restoredAfterSuccess(emptySet(), legacyCleared = false))
        assertEquals(emptyList<String>(), SiteFilterEnforcer.restoredAfterSuccess(emptySet(), legacyCleared = true))
        assertEquals(listOf("failure_setting"), SiteFilterEnforcer.restoredAfterSuccess(setOf("failure_setting"), legacyCleared = true))
        assertEquals(listOf("failure_setting", "host_not_serving"), SiteFilterEnforcer.restoredAfterSuccess(setOf("failure_setting"), legacyCleared = false))
    }
}
