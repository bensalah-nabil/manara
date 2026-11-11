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
    /** Where to begin: a new run by default, or SetupFlow.resumeReconnecting after a restart. */
    private val startAt: SetupFlow.Transition? = null,
    /** Sees each state, so the reconnect step can be saved and resumed after a restart. */
    private val onState: (SetupFlow.State) -> Unit = {},
    /** An unchanged report is sent again this often, so the console can tell a quiet phone from an off one. */
    private val heartbeatMillis: Long = HEARTBEAT_MILLIS,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun run(): SetupFlow.State {
        var transition = startAt ?: SetupFlow.start(earlierAccounts)
        var lastReport: SetupFlow.Report? = null
        var lastSent = 0L
        while (true) {
            onState(transition.state)
            if (transition.report != lastReport || clock() - lastSent >= heartbeatMillis) {
                report(transition.report)
                lastReport = transition.report
                lastSent = clock()
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
     * Steps that only read, or that are safe to repeat (turning an app off or on twice, or
     * wireless debugging off twice, is harmless), get [ATTEMPTS] tries: one dropped adb reply
     * must not end a setup, or leave an app off (found by SetupChaosTest).
     * set-device-owner is not repeated blindly.
     */
    private suspend fun perform(action: Action): Event = when (action) {
        Action.WaitForPairingCode -> { device.pairAndConnect(); Event.Paired }
        Action.ListAccounts -> retrying("list accounts") { device.listAccounts() }
        Action.WaitThenListAccounts -> { delay(pollMillis); retrying("list accounts") { device.listAccounts() } }
        is Action.PauseApps -> Event.AppsPaused(action.packages, retrying("pause apps") { device.pauseApps(action.packages) })
        Action.SetDeviceOwner -> Event.DeviceOwnerOutput(device.setDeviceOwner(), device.isDeviceOwner())
        is Action.ResumeApps -> { retrying("turn apps back on") { device.resumeApps(action.packages) }; Event.AppsResumed }
        Action.TurnOffWirelessDebugging -> { retrying("turn wireless debugging off") { device.turnOffWirelessDebugging() }; Event.WirelessDebuggingOff }
        is Action.Recover -> Event.Recovered(recover(action.packages))
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

    /**
     * Best effort: each step is tried even if the one before failed, and every failure is logged.
     * Returns the apps still off, so the parent is told which to turn back on in Settings.
     */
    private suspend fun recover(packages: List<String>): List<String> {
        var stillPaused = emptyList<String>()
        if (packages.isNotEmpty()) {
            try { retrying("recovery: turn apps back on") { device.resumeApps(packages) } } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
                log("recovery: could not turn $packages back on", error)
                stillPaused = packages
            }
        }
        try { retrying("recovery: turn wireless debugging off") { device.turnOffWirelessDebugging() } } catch (cancelled: CancellationException) { throw cancelled } catch (error: Exception) {
            log("recovery: could not turn wireless debugging off", error)
        }
        return stillPaused
    }

    companion object {
        const val ATTEMPTS = 3
        /** The console treats about three missed heartbeats as a phone that stopped (setup.ts, PHONE_QUIET_MS). */
        const val HEARTBEAT_MILLIS = 60_000L
        private const val TAG = "ManaraSetup"
    }
}
