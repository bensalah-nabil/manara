package com.manara.agent.location

import com.manara.agent.location.LocationRequestDecision.Applied
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationRequestDecisionTest {
    @Test
    fun firstTimeAsks() = assertTrue(LocationRequestDecision.needsRequest(null, 15, 3))

    @Test
    fun sameIntervalSameBootDoesNotRestartTheTimer() =
        assertFalse(LocationRequestDecision.needsRequest(Applied(15, 3), 15, 3))

    @Test
    fun aRebootDroppedTheRequest() = assertTrue(LocationRequestDecision.needsRequest(Applied(15, 3), 15, 4))

    @Test
    fun aNewIntervalAsksAgain() = assertTrue(LocationRequestDecision.needsRequest(Applied(15, 3), 30, 3))
}
