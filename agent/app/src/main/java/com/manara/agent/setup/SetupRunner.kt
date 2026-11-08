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

    /**
     * Steps that only read, or that are safe to repeat (putting back skips what is installed,
     * turning wireless debugging off twice is harmless), get [ATTEMPTS] tries: one dropped adb
     * reply must not end a setup, or leave an app uninstalled (found by SetupChaosTest).
     * Uninstalling and set-device-owner are not repeated blindly.
     */
    private suspend fun perform(action: Action): Event = when (action) {
        Action.WaitForPairingCode -> { device.pairAndConnect(); Event.Paired }
        Action.ListAccounts -> retrying("list accounts") { device.listAccounts() }
        Action.WaitThenListAccounts -> { delay(pollMillis); retrying("list accounts") { device.listAccounts() } }
        is Action.BackUpAndUninstall -> { device.backUpAndUninstall(action.packages); Event.AppsRemoved(action.packages) }
        Action.SetDeviceOwner -> Event.DeviceOwnerOutput(device.setDeviceOwner())
        is Action.RestoreApps -> { retrying("put apps back") { device.restoreApps(action.packages) }; Event.AppsRestored }
        Action.TurnOffWirelessDebugging -> { retrying("turn wireless debugging off") { device.turnOffWirelessDebugging() }; Event.WirelessDebuggingOff }
        is Action.Recover -> { recover(action.packages); Event.Recovered }
        Action.WatchAccounts -> {
            delay(pollMillis)
            retrying("watch accounts") { device.watchAccounts() }?.let { Event.Accounts(it) } ?: Event.ParentFinished
        }
        Action.Stop -> error("Stop is never performed")
    }

    private suspend fun <T> retrying(what: String, block: suspend () -> T): T {
        var last: Exception? = null
        repeat(ATTEMPTS) { attempt ->
            try {
                return block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                last = error
                log("$what failed (try ${attempt + 1} of $ATTEMPTS)", error)
                if (attempt < ATTEMPTS - 1) delay(pollMillis)
            }
        }
        throw last!!
    }

    // Best effort: each step is tried even if the one before failed, and every failure is logged.
    private suspend fun recover(packages: List<String>) {
        if (packages.isNotEmpty()) {
            try { retrying("recovery: put apps back") { device.restoreApps(packages) } } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
                log("recovery: could not restore $packages", error)
            }
        }
        try { retrying("recovery: turn wireless debugging off") { device.turnOffWirelessDebugging() } } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
            log("recovery: could not turn wireless debugging off", error)
        }
    }

    companion object {
        const val ATTEMPTS = 3
        private const val TAG = "ManaraSetup"
    }
}
