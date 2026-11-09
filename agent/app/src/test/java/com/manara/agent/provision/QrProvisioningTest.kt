package com.manara.agent.provision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QrProvisioningTest {

    private val fullyManaged = 1 // DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
    private val workProfile = 2

    @Test
    fun `the whole phone is managed whenever Android offers it, or doesn't say`() {
        assertTrue(QrProvisioning.acceptsFullyManaged(listOf(fullyManaged, workProfile), fullyManaged))
        assertTrue(QrProvisioning.acceptsFullyManaged(null, fullyManaged))
        assertTrue(QrProvisioning.acceptsFullyManaged(emptyList(), fullyManaged))
    }

    @Test
    fun `a work profile alone is refused, Manara manages whole phones only`() {
        assertFalse(QrProvisioning.acceptsFullyManaged(listOf(workProfile), fullyManaged))
    }

    @Test
    fun `the connection code is taken as the server issues it, and nothing else`() {
        val code = "3f9a0c1d2e4b5a6978c0d1e2f3a4b5c6"
        assertEquals(code, QrProvisioning.tokenFrom(" $code\n"))
        assertNull(QrProvisioning.tokenFrom(null))
        assertNull(QrProvisioning.tokenFrom(42))
        assertNull(QrProvisioning.tokenFrom("short"))
        assertNull(QrProvisioning.tokenFrom("has spaces inside it"))
        assertNull(QrProvisioning.tokenFrom("<script>alert(1)</script>"))
        assertNull(QrProvisioning.tokenFrom("a".repeat(201)))
    }
}
