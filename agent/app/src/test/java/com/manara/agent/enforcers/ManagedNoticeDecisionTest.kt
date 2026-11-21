package com.manara.agent.enforcers

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManagedNoticeDecisionTest {
    @Test
    fun `the notice is visible only with notifications on and its channel not blocked`() {
        // NotificationManager.IMPORTANCE_NONE is 0, IMPORTANCE_LOW 2.
        assertTrue(ManagedNoticeDecision.visible(notificationsEnabled = true, channelImportance = 2))
        assertTrue(ManagedNoticeDecision.visible(notificationsEnabled = true, channelImportance = null))
        assertFalse(ManagedNoticeDecision.visible(notificationsEnabled = true, channelImportance = 0))
        assertFalse(ManagedNoticeDecision.visible(notificationsEnabled = false, channelImportance = 2))
    }
}
