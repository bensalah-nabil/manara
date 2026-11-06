package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import com.manara.agent.setup.SetupFlow.Action
import com.manara.agent.setup.SetupFlow.Event
import com.manara.agent.setup.SetupFlow.Status
import com.manara.agent.setup.SetupFlow.Step
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SetupFlowTest {

    private val google = Account("com.google", "kid@gmail.com")
    private val samsung = Account("com.osp.app.signin", "kid@samsung")
    private val whatsapp = Account("com.whatsapp", "WhatsApp")
    private val installed = setOf("com.whatsapp", "com.android.chrome")
    // Owners as `dumpsys account` reported them on the A52.
    private val owners = mapOf(
        "com.google" to "com.google.android.gms",
        "com.osp.app.signin" to "com.osp.app.signin",
        "com.whatsapp" to "com.whatsapp",
        "www.instagram.com" to "com.instagram.android",
    )
    private val ownerOk = "Success: Device owner set to package com.manara.agent/.ManaraDeviceAdminReceiver\n" +
        "Active admin set to component com.manara.agent/.ManaraDeviceAdminReceiver\n"

    private fun listed(
        accounts: List<Account>,
        userApps: Set<String> = installed,
        owners: Map<String, String> = this.owners,
        otherUsers: Int = 0,
    ) = Event.Accounts(accounts, owners, userApps, otherUsers)

    private fun run(vararg events: Event): SetupFlow.Transition {
        var transition = SetupFlow.start()
        for (event in events) transition = SetupFlow.next(transition.state, event)
        return transition
    }

    @Test
    fun `setup starts by asking the parent for the pairing code`() {
        val start = SetupFlow.start()
        assertEquals(Action.WaitForPairingCode, start.action)
        assertEquals(Step.PAIRING, start.report.step)
        assertEquals(Status.WAITING_FOR_PARENT, start.report.status)
    }

    @Test
    fun `full path with an app account and manual accounts`() {
        var t = run(Event.Paired)
        assertEquals(Action.ListAccounts, t.action)

        t = SetupFlow.next(t.state, listed(listOf(google, samsung, whatsapp)))
        assertEquals(Action.BackUpAndUninstall(listOf("com.whatsapp")), t.action)
        assertEquals(Step.REMOVING_APP_ACCOUNTS, t.report.step)
        assertEquals(listOf(google, samsung, whatsapp), t.report.accounts)
        assertEquals(listOf(google, samsung, whatsapp), t.state.initialAccounts)

        t = SetupFlow.next(t.state, Event.AppsRemoved(listOf("com.whatsapp")))
        assertEquals(Action.ListAccounts, t.action)

        t = SetupFlow.next(t.state, listed(listOf(google, samsung), installed - "com.whatsapp"))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        assertEquals(listOf(google, samsung), t.report.accounts)

        t = SetupFlow.next(t.state, listed(listOf(google), installed - "com.whatsapp"))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(listOf(google), t.report.accounts)
        assertEquals("the first list is kept for the reconnect checklist", listOf(google, samsung, whatsapp), t.state.initialAccounts)

        t = SetupFlow.next(t.state, listed(emptyList(), installed - "com.whatsapp"))
        assertEquals(Action.SetDeviceOwner, t.action)
        assertEquals(emptyList<Account>(), t.report.accounts)

        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals(Action.RestoreApps(listOf("com.whatsapp")), t.action)
        assertEquals(Step.RESTORING_APPS, t.report.step)

        t = SetupFlow.next(t.state, Event.AppsRestored)
        assertEquals(Action.TurnOffWirelessDebugging, t.action)

        t = SetupFlow.next(t.state, Event.WirelessDebuggingOff)
        assertEquals(Action.WatchAccounts, t.action)
        assertEquals(Step.RECONNECTING, t.report.step)
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)

        t = SetupFlow.next(t.state, Event.Accounts(listOf(whatsapp, google)))
        assertEquals(Action.WatchAccounts, t.action)
        assertEquals(listOf(whatsapp, google), t.report.accounts)

        t = SetupFlow.next(t.state, Event.Accounts(listOf(whatsapp, google, samsung)))
        assertEquals(Action.Stop, t.action)
        assertEquals(Step.DONE, t.report.step)
        assertEquals(Status.DONE, t.report.status)
    }

    @Test
    fun `a phone with no accounts goes straight to device owner and finishes without a reconnect step`() {
        var t = run(Event.Paired, listed(emptyList()))
        assertEquals(Action.SetDeviceOwner, t.action)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals("nothing was removed, so nothing to restore", Action.TurnOffWirelessDebugging, t.action)
        t = SetupFlow.next(t.state, Event.WirelessDebuggingOff)
        assertEquals(Step.DONE, t.report.step)
        assertEquals(Action.Stop, t.action)
    }

    @Test
    fun `the parent can finish without every account back`() {
        var t = run(
            Event.Paired, listed(listOf(google)), listed(emptyList()),
            Event.DeviceOwnerOutput(ownerOk), Event.WirelessDebuggingOff,
        )
        assertEquals(Step.RECONNECTING, t.report.step)
        t = SetupFlow.next(t.state, Event.ParentFinished)
        assertEquals(Status.DONE, t.report.status)
        assertNull("the stored lists are left as they are", t.report.accounts)
    }

    @Test
    fun `only apps the user installed are uninstalled, found by the account's real owner`() {
        val instagram = Account("www.instagram.com", "kid_insta")
        val t = run(Event.Paired, listed(listOf(whatsapp, instagram, google), userApps = setOf("com.whatsapp", "com.instagram.android")))
        assertEquals(Action.BackUpAndUninstall(listOf("com.whatsapp", "com.instagram.android")), t.action)
    }

    @Test
    fun `an app already removed is not removed again`() {
        val t = run(
            Event.Paired, listed(listOf(whatsapp)), Event.AppsRemoved(listOf("com.whatsapp")),
            listed(listOf(whatsapp)),
        )
        assertEquals(Action.WaitThenListAccounts, t.action)
    }

    @Test
    fun `an account with no app behind it gets its own message, not 'remove it in Settings'`() {
        val t = run(Event.Paired, listed(listOf(whatsapp), owners = owners - "com.whatsapp"))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertTrue(t.report.message.contains("orphan account cleaner"))
        assertFalse(t.report.message.contains("Settings, Accounts"))
    }

    @Test
    fun `the waiting message covers every kind of blocker at once`() {
        val t = run(Event.Paired, listed(listOf(google), owners = owners - "com.google" + ("x" to "y"), otherUsers = 1))
        assertTrue(t.report.message.contains("orphan account cleaner"))
        assertTrue(t.report.message.contains("Secure Folder"))
        val both = run(Event.Paired, listed(listOf(google, samsung), owners = owners - "com.google"))
        assertTrue(both.report.message.contains("remove the 1 account(s)"))
        assertTrue(both.report.message.contains("1 account(s) belong to an app that is gone"))
    }

    @Test
    fun `a second user blocks device owner even with no accounts`() {
        var t = run(Event.Paired, listed(emptyList(), otherUsers = 1))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        assertTrue(t.report.message.contains("Secure Folder"))
        t = SetupFlow.next(t.state, listed(emptyList()))
        assertEquals(Action.SetDeviceOwner, t.action)
    }

    @Test
    fun `Google and Samsung accounts are never uninstalled, only waited on`() {
        val t = run(Event.Paired, listed(listOf(google, samsung)))
        assertEquals(Action.WaitThenListAccounts, t.action)
    }

    @Test
    fun `a failed device owner command fails the setup and puts removed apps back`() {
        val t = run(
            Event.Paired, listed(listOf(whatsapp)), Event.AppsRemoved(listOf("com.whatsapp")),
            listed(emptyList(), installed - "com.whatsapp"),
            Event.DeviceOwnerOutput(
                "Exception occurred while executing 'set-device-owner':\n" +
                    "java.lang.IllegalStateException: example reason\n" +
                    "\tat com.android.server.devicepolicy.Example.method\n",
            ),
        )
        assertEquals(Action.Recover(listOf("com.whatsapp")), t.action)
        assertEquals(Status.FAILED, t.report.status)
        assertEquals(Step.DEVICE_OWNER, t.report.step)
        assertEquals("Could not make Manara the phone manager: example reason", t.report.message)
    }

    @Test
    fun `a failure once wireless debugging is off does not try to use it`() {
        val t = run(
            Event.Paired, listed(listOf(google)), listed(emptyList()),
            Event.DeviceOwnerOutput(ownerOk), Event.WirelessDebuggingOff, Event.Failed("cannot read accounts"),
        )
        assertEquals(Action.Stop, t.action)
        assertEquals(Step.RECONNECTING, t.report.step)
        assertEquals(Status.FAILED, t.report.status)
    }

    @Test
    fun `after recovery the failure stays reported and nothing else runs`() {
        var t = run(Event.Paired, Event.Failed("adb connection lost"))
        assertEquals(Action.Recover(emptyList()), t.action)
        t = SetupFlow.next(t.state, Event.Recovered)
        assertEquals(Action.Stop, t.action)
        assertEquals(Status.FAILED, t.report.status)
        assertEquals("adb connection lost", t.report.message)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals("a late result cannot restart a failed setup", Action.Stop, t.action)
        assertEquals("adb connection lost", t.report.message)
    }

    @Test
    fun `a failure before pairing has nothing to undo`() {
        val t = SetupFlow.next(SetupFlow.start().state, Event.Failed("pairing code rejected"))
        assertEquals(Action.Stop, t.action)
        assertEquals(Status.FAILED, t.report.status)
    }

    @Test
    fun `an event out of order fails safely instead of skipping ahead`() {
        val t = SetupFlow.next(SetupFlow.start().state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals(Status.FAILED, t.report.status)
        assertFalse(t.action is Action.RestoreApps)
        assertTrue(t.report.message.contains("pairing"))
    }

    @Test
    fun `reports stay within the server's limits`() {
        val many = (1..150).map { Account("com.example.t$it", "a$it") }
        val t = run(Event.Paired, listed(many))
        assertEquals(SetupFlow.MAX_ACCOUNTS, t.report.accounts!!.size)
        val failed = SetupFlow.next(t.state, Event.Failed("x".repeat(1000)))
        assertEquals(SetupFlow.MAX_MESSAGE, failed.report.message.length)
    }

    @Test
    fun `device owner success is read from the shell's own success line only`() {
        assertTrue(SetupFlow.deviceOwnerSucceeded(ownerOk))
        assertFalse(SetupFlow.deviceOwnerSucceeded("Success: Active admin set to component x"))
        assertFalse(SetupFlow.deviceOwnerSucceeded(""))
    }

    @Test
    fun `steps match the server's wire values in order`() {
        assertEquals(
            listOf("linked", "pairing", "checking_accounts", "removing_app_accounts", "waiting_for_accounts",
                "device_owner", "restoring_apps", "reconnecting", "done"),
            Step.entries.map { it.wire },
        )
        assertEquals(listOf("in_progress", "waiting_for_parent", "failed", "done"), Status.entries.map { it.wire })
    }
}
