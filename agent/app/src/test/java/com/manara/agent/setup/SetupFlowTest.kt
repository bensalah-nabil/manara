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
    private val gms = "com.google.android.gms"
    // Owners as `dumpsys account` reported them on the A52.
    private val owners = mapOf(
        "com.google" to gms,
        "com.osp.app.signin" to "com.osp.app.signin",
        "com.whatsapp" to "com.whatsapp",
        "www.instagram.com" to "com.instagram.android",
    )
    private val ownerOk = "Success: Device owner set to package com.manara.agent/.OwnerReceiver\n" +
        "Active admin set to component com.manara.agent/.OwnerReceiver\n"
    private val refusedForAccounts =
        "Exception occurred while executing 'set-device-owner':\n" +
            "java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device.\n"

    private fun listed(
        accounts: List<Account>,
        owners: Map<String, String> = this.owners,
        keepRunning: Set<String> = emptySet(),
        otherUsers: Int = 0,
    ) = Event.Accounts(accounts, owners, keepRunning, otherUsers)

    /** A paused app's authenticator is no longer registered, so its type has no owner. */
    private fun withoutOwners(vararg packages: String) = owners.filterValues { it !in packages }

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
    fun `the first list is sent whole, once, for the server to keep`() {
        val t = run(Event.Paired, listed(listOf(google, whatsapp)))
        assertEquals(Action.ListAccounts, t.action)
        assertEquals(listOf(google, whatsapp), t.report.accounts)
        assertEquals(listOf(google, whatsapp), t.state.initialAccounts)
        assertEquals("nothing touched yet", emptyList<String>(), t.state.pausedApps)
    }

    @Test
    fun `full path, apps holding accounts are paused, never uninstalled, and nothing needs signing back in`() {
        val all = listOf(google, whatsapp)
        var t = run(Event.Paired, listed(all), listed(all))
        assertEquals(Action.PauseApps(listOf(gms, "com.whatsapp")), t.action)
        assertEquals(Step.REMOVING_APP_ACCOUNTS, t.report.step)
        assertTrue(t.report.message.contains("Nothing is deleted"))
        assertEquals("recorded before anything is touched", listOf(gms, "com.whatsapp"), t.state.pausedApps)

        t = SetupFlow.next(t.state, Event.AppsPaused(listOf(gms, "com.whatsapp")))
        assertEquals(Action.ListAccounts, t.action)

        // Still in the list, but no longer counted: their apps are off.
        t = SetupFlow.next(t.state, listed(all, withoutOwners(gms, "com.whatsapp")))
        assertEquals(Action.SetDeviceOwner, t.action)

        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals(Action.ResumeApps(listOf(gms, "com.whatsapp")), t.action)
        assertEquals(Step.RESTORING_APPS, t.report.step)

        t = SetupFlow.next(t.state, Event.AppsResumed)
        assertEquals(Action.TurnOffWirelessDebugging, t.action)
        assertEquals(emptyList<String>(), t.state.pausedApps)

        t = SetupFlow.next(t.state, Event.WirelessDebuggingOff)
        assertEquals(Action.WatchAccounts, t.action)
        assertEquals(Step.RECONNECTING, t.report.step)
        assertEquals("checking, not asking the parent for anything", Status.IN_PROGRESS, t.report.status)

        t = SetupFlow.next(t.state, Event.Accounts(all))
        assertEquals(Action.Stop, t.action)
        assertEquals(Step.DONE, t.report.step)
        assertEquals(Status.DONE, t.report.status)
    }

    @Test
    fun `a resumed app's account that is slow to show is waited for, then handed to the parent`() {
        var t = run(
            Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.AppsPaused(listOf("com.whatsapp")),
            listed(listOf(whatsapp), withoutOwners("com.whatsapp")), Event.DeviceOwnerOutput(ownerOk),
            Event.AppsResumed, Event.WirelessDebuggingOff,
        )
        repeat(SetupFlow.MAX_RETURN_CHECKS) {
            t = SetupFlow.next(t.state, Event.Accounts(emptyList()))
            assertEquals(Status.IN_PROGRESS, t.report.status)
        }
        t = SetupFlow.next(t.state, Event.Accounts(emptyList()))
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        assertTrue(t.report.message.contains("Finish setup"))
    }

    @Test
    fun `a phone with no accounts goes straight to device owner and finishes without a reconnect step`() {
        var t = run(Event.Paired, listed(emptyList()), listed(emptyList()))
        assertEquals(Action.SetDeviceOwner, t.action)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals("nothing was paused, so nothing to turn back on", Action.TurnOffWirelessDebugging, t.action)
        t = SetupFlow.next(t.state, Event.WirelessDebuggingOff)
        assertEquals(Step.DONE, t.report.step)
        assertEquals(Action.Stop, t.action)
    }

    @Test
    fun `an account no app is registered for does not block, Android doesn't count it`() {
        val orphan = Account("com.gone.app", "orphan")
        val t = run(Event.Paired, listed(listOf(orphan)), listed(listOf(orphan)))
        assertEquals(Action.SetDeviceOwner, t.action)
    }

    @Test
    fun `the keyboard, home screen, phone and SMS apps are never paused, their accounts go to the parent`() {
        val t = run(Event.Paired, listed(listOf(google, whatsapp)), listed(listOf(google, whatsapp), keepRunning = setOf(gms)))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(Step.WAITING_FOR_ACCOUNTS, t.report.step)
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        assertEquals("only what the parent must remove", listOf(google), t.report.accounts)
        assertTrue(t.report.message.contains("Settings, Accounts"))
        assertEquals("nothing paused while the parent still has work", emptyList<String>(), t.state.pausedApps)
    }

    @Test
    fun `Android itself and Manara are never paused`() {
        val system = Account("com.android.system.thing", "x")
        val t = run(Event.Paired, listed(listOf(system)), listed(listOf(system), owners = mapOf(system.type to "android")))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(listOf(system), t.report.accounts)
        assertTrue("com.manara.agent" in SetupFlow.NEVER_PAUSE)
    }

    @Test
    fun `an app Android refuses to turn off hands its account to the parent`() {
        var t = run(Event.Paired, listed(listOf(google, samsung)), listed(listOf(google, samsung)))
        assertEquals(Action.PauseApps(listOf(gms, "com.osp.app.signin")), t.action)
        t = SetupFlow.next(t.state, Event.AppsPaused(listOf(gms), refused = listOf("com.osp.app.signin")))
        assertEquals("the refused app is not off, so not resumed or recovered", listOf(gms), t.state.pausedApps)
        t = SetupFlow.next(t.state, listed(listOf(google, samsung), withoutOwners(gms)))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(listOf(samsung), t.report.accounts)
        // The parent removes it in Settings; setup goes on and still turns Google back on.
        t = SetupFlow.next(t.state, listed(listOf(google), withoutOwners(gms)))
        assertEquals(Action.SetDeviceOwner, t.action)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals(Action.ResumeApps(listOf(gms)), t.action)
    }

    @Test
    fun `the parent can finish without every account back`() {
        var t = run(
            Event.Paired, listed(listOf(google)), listed(listOf(google), keepRunning = setOf(gms)),
            listed(emptyList()), Event.DeviceOwnerOutput(ownerOk), Event.WirelessDebuggingOff,
        )
        assertEquals(Step.RECONNECTING, t.report.step)
        t = SetupFlow.next(t.state, Event.Accounts(emptyList()))
        assertEquals("removed by the parent: it does not come back by itself", Status.WAITING_FOR_PARENT, t.report.status)
        t = SetupFlow.next(t.state, Event.ParentFinished)
        assertEquals(Status.DONE, t.report.status)
        assertNull("the stored lists are left as they are", t.report.accounts)
    }

    @Test
    fun `nothing is paused while another user is on the phone`() {
        val t = run(Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp), otherUsers = 1))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertTrue(t.report.message.contains("Secure Folder"))
        assertEquals(emptyList<String>(), t.state.pausedApps)
    }

    @Test
    fun `a second user blocks device owner even with no accounts`() {
        var t = run(Event.Paired, listed(emptyList()), listed(emptyList(), otherUsers = 1))
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
        t = SetupFlow.next(t.state, listed(emptyList()))
        assertEquals(Action.SetDeviceOwner, t.action)
    }

    @Test
    fun `an app already paused is not paused again`() {
        var t = run(Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.AppsPaused(listOf("com.whatsapp")))
        // Android still lists it as registered a moment after: device owner is tried, not a second pause.
        t = SetupFlow.next(t.state, listed(listOf(whatsapp)))
        assertEquals(Action.SetDeviceOwner, t.action)
    }

    @Test
    fun `accounts from an earlier unfinished run are still offered to sign back in to`() {
        var t = SetupFlow.start(earlierAccounts = listOf(google, samsung))
        t = SetupFlow.next(t.state, Event.Paired)
        t = SetupFlow.next(t.state, listed(emptyList()))
        assertEquals(listOf(google, samsung), t.state.initialAccounts)
        t = SetupFlow.next(t.state, listed(emptyList()))
        assertEquals(Action.SetDeviceOwner, t.action)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        t = SetupFlow.next(t.state, Event.WirelessDebuggingOff)
        assertEquals("not finished: there is something to sign back in to", Step.RECONNECTING, t.report.step)
        t = SetupFlow.next(t.state, Event.Accounts(emptyList()))
        assertEquals(Status.WAITING_FOR_PARENT, t.report.status)
    }

    @Test
    fun `a failed device owner command fails the setup and turns paused apps back on`() {
        val t = run(
            Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.AppsPaused(listOf("com.whatsapp")),
            listed(listOf(whatsapp), withoutOwners("com.whatsapp")),
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
    fun `a failure while pausing turns back on every app recorded, even those not reached`() {
        val t = run(Event.Paired, listed(listOf(google, whatsapp)), listed(listOf(google, whatsapp)), Event.Failed("adb dropped"))
        assertEquals(Action.Recover(listOf(gms, "com.whatsapp")), t.action)
    }

    @Test
    fun `apps recovery could not turn back on are named to the parent`() {
        var t = run(Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.Failed("adb dropped"))
        t = SetupFlow.next(t.state, Event.Recovered(stillPaused = listOf("com.whatsapp")))
        assertEquals(Action.Stop, t.action)
        assertEquals(Status.FAILED, t.report.status)
        assertTrue(t.report.message.contains("Settings, Apps: com.whatsapp"))
        assertTrue(t.report.message.contains("adb dropped"))
    }

    @Test
    fun `a refusal for an account Android still counts is checked again, not failed`() {
        var t = run(
            Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.AppsPaused(listOf("com.whatsapp")),
            listed(listOf(whatsapp), withoutOwners("com.whatsapp")),
            Event.DeviceOwnerOutput(refusedForAccounts),
        )
        assertEquals(Action.WaitThenListAccounts, t.action)
        assertEquals(Status.IN_PROGRESS, t.report.status)
        assertEquals(1, t.state.ownerRetries)

        t = SetupFlow.next(t.state, listed(listOf(whatsapp), withoutOwners("com.whatsapp")))
        assertEquals(Action.SetDeviceOwner, t.action)
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(ownerOk))
        assertEquals(Action.ResumeApps(listOf("com.whatsapp")), t.action)
    }

    @Test
    fun `a refusal that keeps coming back fails after the last check and turns apps back on`() {
        var t = run(
            Event.Paired, listed(listOf(whatsapp)), listed(listOf(whatsapp)), Event.AppsPaused(listOf("com.whatsapp")),
            listed(listOf(whatsapp), withoutOwners("com.whatsapp")),
        )
        repeat(SetupFlow.MAX_OWNER_RETRIES) {
            t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(refusedForAccounts))
            assertEquals(Action.WaitThenListAccounts, t.action)
            t = SetupFlow.next(t.state, listed(listOf(whatsapp), withoutOwners("com.whatsapp")))
            assertEquals(Action.SetDeviceOwner, t.action)
        }
        t = SetupFlow.next(t.state, Event.DeviceOwnerOutput(refusedForAccounts))
        assertEquals(Action.Recover(listOf("com.whatsapp")), t.action)
        assertEquals(Status.FAILED, t.report.status)
    }

    @Test
    fun `an account added during setup is handled like the others`() {
        var t = run(Event.Paired, listed(emptyList()), listed(emptyList()), Event.DeviceOwnerOutput(refusedForAccounts))
        t = SetupFlow.next(t.state, listed(listOf(whatsapp)))
        assertEquals(Action.PauseApps(listOf("com.whatsapp")), t.action)
    }

    @Test
    fun `a failure once wireless debugging is off does not try to use it`() {
        val t = run(
            Event.Paired, listed(listOf(google)), listed(listOf(google)), Event.AppsPaused(listOf(gms)),
            listed(listOf(google), withoutOwners(gms)), Event.DeviceOwnerOutput(ownerOk), Event.AppsResumed,
            Event.WirelessDebuggingOff, Event.Failed("cannot read accounts"),
        )
        assertEquals(Action.Stop, t.action)
        assertEquals(Step.RECONNECTING, t.report.step)
        assertEquals(Status.FAILED, t.report.status)
    }

    @Test
    fun `after recovery the failure stays reported and nothing else runs`() {
        var t = run(Event.Paired, Event.Failed("adb connection lost"))
        assertEquals(Action.Recover(emptyList()), t.action)
        t = SetupFlow.next(t.state, Event.Recovered())
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
        assertFalse(t.action is Action.ResumeApps)
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
