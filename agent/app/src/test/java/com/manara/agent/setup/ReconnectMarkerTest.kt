package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import com.manara.agent.setup.SetupFlow.Action
import com.manara.agent.setup.SetupFlow.Event
import com.manara.agent.setup.SetupFlow.State
import com.manara.agent.setup.SetupFlow.Status
import com.manara.agent.setup.SetupFlow.Step
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReconnectMarkerTest {

    private val google = Account("com.google", "kid@gmail.com")
    private val facebook = Account("com.facebook.auth.login", "100090061125361")

    @Test
    fun `only the reconnect step of a run that hasn't failed is kept`() {
        val initial = listOf(google, facebook)
        assertEquals(initial, ReconnectMarker.toKeep(State(Step.RECONNECTING, initialAccounts = initial)))
        assertNull(ReconnectMarker.toKeep(State(Step.RECONNECTING, initialAccounts = initial, failure = "stopped")))
        assertNull(ReconnectMarker.toKeep(State(Step.DONE, initialAccounts = initial)))
        assertNull(ReconnectMarker.toKeep(State(Step.PAIRING)))
        assertNull("nothing to watch for", ReconnectMarker.toKeep(State(Step.RECONNECTING, initialAccounts = emptyList())))
    }

    @Test
    fun `the list survives the file, and a name that would break a line is left out`() {
        val odd = Account("com.whatsapp", "two\nlines")
        assertEquals(listOf(google, facebook), ReconnectMarker.decode(ReconnectMarker.encode(listOf(google, odd, facebook))))
        assertEquals(emptyList<Account>(), ReconnectMarker.decode("garbage without a tab\n\n"))
    }

    @Test
    fun `after a restart the watch picks up where it was, and finishes once everything is back`() {
        // The SM-A045F was turned off in this step; the parent then signed back in to Google.
        var t = SetupFlow.resumeReconnecting(listOf(google, facebook))
        assertEquals(Action.WatchAccounts, t.action)
        assertEquals(Step.RECONNECTING, t.report.step)
        t = SetupFlow.next(t.state, Event.Accounts(listOf(facebook)))
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        assertEquals(listOf(google), t.report.signBackIn)
        t = SetupFlow.next(t.state, Event.Accounts(listOf(facebook, google)))
        assertEquals(Status.DONE, t.report.status)
        assertNull("finished: nothing to resume", ReconnectMarker.toKeep(t.state))
    }

    @Test
    fun `after a restart the parent's Finish still ends it`() {
        val t = SetupFlow.next(SetupFlow.resumeReconnecting(listOf(google)).state, Event.ParentFinished)
        assertEquals(Step.DONE, t.state.step)
    }
}
