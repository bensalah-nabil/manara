package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import com.manara.agent.setup.SetupFlow.Report
import com.manara.agent.setup.SetupFlow.Status
import com.manara.agent.setup.SetupFlow.Step
import com.manara.agent.setup.SetupNotice.AddAccount
import com.manara.agent.setup.SetupNotice.OpenAccounts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SetupNoticeTest {

    private val google = Account("com.google", "kid@gmail.com")
    private val facebook = Account("com.facebook.auth.login", "kid")

    @Test
    fun `accounts to remove open Settings' account list`() {
        val report = Report(Step.WAITING_FOR_ACCOUNTS, Status.WAITING_FOR_PARENT, "remove", listOf(google))
        assertEquals(OpenAccounts, SetupNotice.buttonFor(report))
    }

    @Test
    fun `only another user to remove offers no account screen`() {
        assertNull(SetupNotice.buttonFor(Report(Step.WAITING_FOR_ACCOUNTS, Status.WAITING_FOR_PARENT, "Secure Folder", emptyList())))
    }

    @Test
    fun `a missing Google account is offered first and alone`() {
        val report = Report(Step.RECONNECTING, Status.WAITING_FOR_PARENT, "sign in", emptyList(), signBackIn = listOf(facebook, google))
        val button = SetupNotice.buttonFor(report)
        assertEquals(AddAccount(listOf("com.google")), button)
        assertEquals("Add Google account", button!!.label)
    }

    @Test
    fun `other missing accounts are offered together`() {
        val report = Report(Step.RECONNECTING, Status.WAITING_FOR_PARENT, "sign in", emptyList(), signBackIn = listOf(facebook))
        assertEquals("Add account", SetupNotice.buttonFor(report)!!.label)
    }

    @Test
    fun `nothing is offered while setup works by itself or once it is done`() {
        assertNull(SetupNotice.buttonFor(Report(Step.RECONNECTING, Status.IN_PROGRESS, "checking", null, signBackIn = listOf(google))))
        assertNull(SetupNotice.buttonFor(Report(Step.DONE, Status.DONE, "done", null)))
        assertNull(SetupNotice.buttonFor(Report(Step.RECONNECTING, Status.WAITING_FOR_PARENT, "nothing missing", emptyList())))
    }
}
