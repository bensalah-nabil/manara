package com.manara.agent.enforcers

import com.manara.agent.enforcers.HealthTracker.Change
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthTrackerTest {

    @Test
    fun `first observation unhealthy is reported`() {
        assertEquals(Change.BROKE, HealthTracker.change(previous = null, healthy = false))
    }

    @Test
    fun `first observation healthy is silent`() {
        assertEquals(Change.NONE, HealthTracker.change(previous = null, healthy = true))
    }

    @Test
    fun `healthy to unhealthy is reported once`() {
        assertEquals(Change.BROKE, HealthTracker.change(previous = true, healthy = false))
        assertEquals(Change.NONE, HealthTracker.change(previous = false, healthy = false))
    }

    @Test
    fun `recovery is reported`() {
        assertEquals(Change.RESTORED, HealthTracker.change(previous = false, healthy = true))
    }

    @Test
    fun `staying healthy is silent`() {
        assertEquals(Change.NONE, HealthTracker.change(previous = true, healthy = true))
    }
}
