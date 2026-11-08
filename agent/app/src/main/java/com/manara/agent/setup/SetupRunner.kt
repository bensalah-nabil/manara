package com.manara.agent.setup

import android.util.Log
import com.manara.agent.setup.SetupFlow.Action
import com.manara.agent.setup.SetupFlow.Event
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/** Drives [SetupFlow] against a [SetupDevice], sending every changed report to [report]. */
class SetupRunner(
    private val device: SetupDevice,
    private val report: suspend (SetupFlow.Report) -> Unit,
    private val pollMillis: Long = 5_000,
    /** What an earlier, unfinished run found on the phone (SetupFlow.start). */
    private val earlierAccounts: List<AccountDump.Account> = emptyList(),
    private val log: (String, Throwable?) -> Unit = { message, error -> Log.w(TAG, message, error) },
) {
    suspend fun run(): SetupFlow.State {
        var transition = SetupFlow.start(earlierAccounts)
        var lastReport: SetupFlow.Report? = null
        while (true) {
            if (transition.report != lastReport) {
                report(transition.report)
                lastReport = transition.report
            }
            if (transition.action == Action.Stop) return transition.state
            val event = try {
                perform(transition.action)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                log("setup action ${transition.action} failed", error)
                Event.Failed(error.message ?: error::class.java.simpleName)
            }
            transition = SetupFlow.next(transition.state, event)
        }
    }

    private suspend fun perform(action: Action): Event = when (action) {
        Action.WaitForPairingCode -> { device.pairAndConnect(); Event.Paired }
        Action.ListAccounts -> device.listAccounts()
        Action.WaitThenListAccounts -> { delay(pollMillis); device.listAccounts() }
        is Action.BackUpAndUninstall -> { device.backUpAndUninstall(action.packages); Event.AppsRemoved(action.packages) }
        Action.SetDeviceOwner -> Event.DeviceOwnerOutput(device.setDeviceOwner())
        is Action.RestoreApps -> { device.restoreApps(action.packages); Event.AppsRestored }
        Action.TurnOffWirelessDebugging -> { device.turnOffWirelessDebugging(); Event.WirelessDebuggingOff }
        is Action.Recover -> { recover(action.packages); Event.Recovered }
        Action.WatchAccounts -> {
            delay(pollMillis)
            device.watchAccounts()?.let { Event.Accounts(it) } ?: Event.ParentFinished
        }
        Action.Stop -> error("Stop is never performed")
    }

    // Best effort: each step is tried even if the one before failed, and every failure is logged.
    private suspend fun recover(packages: List<String>) {
        if (packages.isNotEmpty()) {
            try { device.restoreApps(packages) } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
                log("recovery: could not restore $packages", error)
            }
        }
        try { device.turnOffWirelessDebugging() } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
            log("recovery: could not turn wireless debugging off", error)
        }
    }

    private companion object {
        const val TAG = "ManaraSetup"
    }
}
