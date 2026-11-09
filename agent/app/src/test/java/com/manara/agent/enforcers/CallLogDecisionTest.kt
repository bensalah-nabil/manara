package com.manara.agent.enforcers

import android.provider.CallLog
import com.manara.agent.enforcers.CallLogDecision.Row
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CallLogDecisionTest {
    private fun row(id: Long, date: Long) = Row(id, "+216000000", CallLog.Calls.INCOMING_TYPE, date, 10)

    @Test
    fun `calls from before the parent turned it on never leave`() {
        val batch = CallLogDecision.newCalls(listOf(row(1, 100), row(2, 200), row(3, 300)), cursor = 200)
        assertEquals(listOf(3L), batch.calls.map { it.id })
        assertEquals(300L, batch.newCursor)
    }

    @Test
    fun `nothing new keeps the cursor`() {
        assertEquals(500L, CallLogDecision.newCalls(listOf(row(1, 100)), cursor = 500).newCursor)
    }

    @Test
    fun `a long backlog goes oldest first and the cursor skips nothing`() {
        val rows = (1L..250L).map { row(it, it) }.reversed()
        val first = CallLogDecision.newCalls(rows, cursor = 0)
        assertEquals(CallLogDecision.MAX_PER_RUN, first.calls.size)
        assertEquals(1L, first.calls.first().id)
        assertEquals(200L, first.newCursor)
        val second = CallLogDecision.newCalls(rows, first.newCursor)
        assertEquals((201L..250L).toList(), second.calls.map { it.id })
    }

    @Test
    fun `each kind of call has a direction, and others have none`() {
        assertEquals("incoming", CallLogDecision.direction(CallLog.Calls.INCOMING_TYPE))
        assertEquals("outgoing", CallLogDecision.direction(CallLog.Calls.OUTGOING_TYPE))
        assertEquals("missed", CallLogDecision.direction(CallLog.Calls.MISSED_TYPE))
        assertEquals("rejected", CallLogDecision.direction(CallLog.Calls.REJECTED_TYPE))
        assertEquals("blocked", CallLogDecision.direction(CallLog.Calls.BLOCKED_TYPE))
        assertNull(CallLogDecision.direction(CallLog.Calls.VOICEMAIL_TYPE))
    }

    @Test
    fun `a hidden number says so`() {
        assertEquals("private", CallLogDecision.number(null))
        assertEquals("private", CallLogDecision.number("  "))
        assertEquals("+21699", CallLogDecision.number(" +21699 "))
    }
}
