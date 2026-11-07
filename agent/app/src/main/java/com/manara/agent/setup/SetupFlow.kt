package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account

/**
 * Guided setup as a pure state machine: each fact the phone observes goes in as an [Event],
 * and out comes the one fixed [Action] to run next plus the [Report] for the parent's console.
 * Nothing here runs a command; the server never chooses one either.
 */
object SetupFlow {

    /** Same values and order as domain.SetupStep on the server. */
    enum class Step(val wire: String) {
        LINKED("linked"),
        PAIRING("pairing"),
        CHECKING_ACCOUNTS("checking_accounts"),
        REMOVING_APP_ACCOUNTS("removing_app_accounts"),
        WAITING_FOR_ACCOUNTS("waiting_for_accounts"),
        DEVICE_OWNER("device_owner"),
        RESTORING_APPS("restoring_apps"),
        RECONNECTING("reconnecting"),
        DONE("done"),
    }

    enum class Status(val wire: String) {
        IN_PROGRESS("in_progress"),
        WAITING_FOR_PARENT("waiting_for_parent"),
        FAILED("failed"),
        DONE("done"),
    }

    /** `accounts == null` leaves the server's stored lists unchanged. */
    data class Report(val step: Step, val status: Status, val message: String, val accounts: List<Account>?)

    sealed interface Action {
        data object WaitForPairingCode : Action
        data object ListAccounts : Action
        /** Save each app's APKs on the phone, then uninstall it; that deletes the accounts it manages. */
        data class BackUpAndUninstall(val packages: List<String>) : Action
        /** List again after a pause, while the parent removes accounts in Settings. */
        data object WaitThenListAccounts : Action
        data object SetDeviceOwner : Action
        data class RestoreApps(val packages: List<String>) : Action
        /** Turn wireless debugging off and delete Manara's adb key. */
        data object TurnOffWirelessDebugging : Action
        /** After a failure: put back [packages] (best effort), then turn wireless debugging off. */
        data class Recover(val packages: List<String>) : Action
        /** Read accounts through AccountManager; adb is already off by now. */
        data object WatchAccounts : Action
        data object Stop : Action
    }

    sealed interface Event {
        data object Paired : Event
        /**
         * [owners] maps account type to the app that registered it; [userApps] are apps the user
         * installed (`pm list packages -3`); [otherUsers] counts users besides the main one.
         */
        data class Accounts(
            val accounts: List<Account>,
            val owners: Map<String, String> = emptyMap(),
            val userApps: Set<String> = emptySet(),
            val otherUsers: Int = 0,
        ) : Event
        data class AppsRemoved(val packages: List<String>) : Event
        data class DeviceOwnerOutput(val output: String) : Event
        data object AppsRestored : Event
        data object WirelessDebuggingOff : Event
        /** The parent chose to finish without every account back. */
        data object ParentFinished : Event
        data object Recovered : Event
        data class Failed(val message: String) : Event
    }

    data class State(
        val step: Step,
        val initialAccounts: List<Account>? = null,
        val removedApps: List<String> = emptyList(),
        val failure: String? = null,
    )

    data class Transition(val state: State, val action: Action, val report: Report)

    const val MAX_MESSAGE = 300
    const val MAX_ACCOUNTS = 100
    private const val DEVICE_OWNER_SUCCESS = "Success: Device owner set to package "

    fun start(): Transition = Transition(
        State(Step.PAIRING),
        Action.WaitForPairingCode,
        report(
            Step.PAIRING, Status.WAITING_FOR_PARENT,
            "On the phone, in Wireless debugging, tap Pair device with QR code and scan the code in the console, or tap Pair device with pairing code and type its code in the console. Keep the phone on that screen.",
        ),
    )

    fun next(state: State, event: Event): Transition {
        if (event is Event.Failed) return fail(state, event.message)
        if (state.failure != null) return recovering(state, event)
        return when (state.step) {
            Step.PAIRING -> when (event) {
                Event.Paired -> Transition(
                    state.copy(step = Step.CHECKING_ACCOUNTS),
                    Action.ListAccounts,
                    report(Step.CHECKING_ACCOUNTS, Status.IN_PROGRESS, "Checking which accounts are on the phone."),
                )
                else -> unexpected(state, event)
            }
            Step.CHECKING_ACCOUNTS, Step.REMOVING_APP_ACCOUNTS, Step.WAITING_FOR_ACCOUNTS -> when (event) {
                is Event.Accounts -> onAccounts(state, event)
                is Event.AppsRemoved -> if (state.step == Step.REMOVING_APP_ACCOUNTS) {
                    Transition(
                        state.copy(removedApps = (state.removedApps + event.packages).distinct()),
                        Action.ListAccounts,
                        report(Step.REMOVING_APP_ACCOUNTS, Status.IN_PROGRESS, "Apps saved and removed. Checking accounts again."),
                    )
                } else {
                    unexpected(state, event)
                }
                else -> unexpected(state, event)
            }
            Step.DEVICE_OWNER -> when (event) {
                is Event.DeviceOwnerOutput -> if (deviceOwnerSucceeded(event.output)) {
                    val next = state.copy(step = Step.RESTORING_APPS)
                    if (state.removedApps.isEmpty()) {
                        Transition(next, Action.TurnOffWirelessDebugging,
                            report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Manara now manages the phone. Turning wireless debugging off."))
                    } else {
                        Transition(next, Action.RestoreApps(state.removedApps),
                            report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Manara now manages the phone. Putting the apps back."))
                    }
                } else {
                    fail(state, "Could not make Manara the phone manager: ${deviceOwnerError(event.output)}")
                }
                else -> unexpected(state, event)
            }
            Step.RESTORING_APPS -> when (event) {
                Event.AppsRestored -> Transition(
                    state.copy(removedApps = emptyList()),
                    Action.TurnOffWirelessDebugging,
                    report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Apps put back. Turning wireless debugging off."),
                )
                Event.WirelessDebuggingOff -> if (state.initialAccounts.isNullOrEmpty()) {
                    finished(state, emptyList())
                } else {
                    Transition(
                        state.copy(step = Step.RECONNECTING),
                        Action.WatchAccounts,
                        report(Step.RECONNECTING, Status.WAITING_FOR_PARENT,
                            "Sign back in to the accounts you want to keep on this phone, then choose Finish setup in the console. You don't need to sign back in to all of them."),
                    )
                }
                else -> unexpected(state, event)
            }
            Step.RECONNECTING -> when (event) {
                is Event.Accounts -> {
                    val current = event.accounts.distinct()
                    if (state.initialAccounts.orEmpty().all { it in current }) {
                        finished(state, current)
                    } else {
                        Transition(state, Action.WatchAccounts,
                            report(Step.RECONNECTING, Status.WAITING_FOR_PARENT,
                                "Sign back in to the accounts you want to keep on this phone, then choose Finish setup in the console. You don't need to sign back in to all of them.", current))
                    }
                }
                Event.ParentFinished -> finished(state, null)
                else -> unexpected(state, event)
            }
            Step.LINKED, Step.DONE -> unexpected(state, event)
        }
    }

    fun deviceOwnerSucceeded(output: String): Boolean =
        output.lineSequence().any { it.trim().startsWith(DEVICE_OWNER_SUCCESS) }

    /** The exception text the shell printed, or its first line. */
    fun deviceOwnerError(output: String): String {
        val lines = output.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        val exception = lines.firstOrNull { it.contains("Exception: ") }?.substringAfter("Exception: ")
        return exception ?: lines.firstOrNull() ?: "no output"
    }

    private fun onAccounts(state: State, event: Event.Accounts): Transition {
        val accounts = event.accounts.distinct()
        val withInitial = if (state.initialAccounts == null) state.copy(initialAccounts = accounts) else state
        // Uninstalling an app deletes the accounts its authenticator registered (AccountManagerService).
        val removable = accounts
            .mapNotNull { event.owners[it.type] }
            .filter { it in event.userApps && it !in state.removedApps }
            .distinct()
        // Seen on a real phone: an account that outlived its app, with no Settings entry to remove it.
        val orphaned = accounts.filter { it.type !in event.owners }
        val manual = accounts.size - orphaned.size
        return when {
            removable.isNotEmpty() -> Transition(
                withInitial.copy(step = Step.REMOVING_APP_ACCOUNTS),
                Action.BackUpAndUninstall(removable),
                report(Step.REMOVING_APP_ACCOUNTS, Status.IN_PROGRESS,
                    "Saving and removing ${removable.size} app(s) that hold an account. They come back at the end; their data on the phone does not, except what the app backs up itself.",
                    accounts),
            )
            accounts.isNotEmpty() || event.otherUsers > 0 -> Transition(
                withInitial.copy(step = Step.WAITING_FOR_ACCOUNTS),
                Action.WaitThenListAccounts,
                report(Step.WAITING_FOR_ACCOUNTS, Status.WAITING_FOR_PARENT,
                    waitingMessage(manual, orphaned.size, event.otherUsers), accounts),
            )
            else -> Transition(
                withInitial.copy(step = Step.DEVICE_OWNER),
                Action.SetDeviceOwner,
                report(Step.DEVICE_OWNER, Status.IN_PROGRESS, "No accounts left. Making Manara the phone manager.", accounts),
            )
        }
    }

    private fun waitingMessage(manual: Int, orphaned: Int, otherUsers: Int): String = buildList {
        if (manual > 0) add("Write down each password, then remove the $manual account(s) listed in the console from Settings, Accounts.")
        if (orphaned > 0) add("$orphaned account(s) belong to an app that is gone and cannot be removed from Settings; they need the orphan account cleaner tool.")
        // A second user (e.g. Secure Folder) also blocks device owner, even with no accounts.
        if (otherUsers > 0) add("Remove Secure Folder and any other user or profile on the phone.")
    }.joinToString(" ")

    private fun finished(state: State, accounts: List<Account>?) = Transition(
        state.copy(step = Step.DONE),
        Action.Stop,
        report(Step.DONE, Status.DONE, "Setup finished. Manara now manages this phone.", accounts),
    )

    private fun fail(state: State, message: String): Transition {
        if (state.failure != null) return Transition(state, Action.Stop, report(state.step, Status.FAILED, state.failure))
        val failed = state.copy(failure = message)
        // Before pairing there is no adb key; from reconnecting on, wireless debugging is already off.
        val action = when (state.step) {
            Step.PAIRING, Step.RECONNECTING, Step.DONE -> Action.Stop
            else -> Action.Recover(state.removedApps)
        }
        return Transition(failed, action, report(state.step, Status.FAILED, message))
    }

    private fun recovering(state: State, event: Event): Transition = when (event) {
        Event.Recovered -> Transition(state.copy(removedApps = emptyList()), Action.Stop, report(state.step, Status.FAILED, state.failure!!))
        else -> Transition(state, Action.Stop, report(state.step, Status.FAILED, state.failure!!))
    }

    private fun unexpected(state: State, event: Event) =
        fail(state, "Setup stopped: unexpected ${event::class.simpleName} during ${state.step.wire}.")

    private fun report(step: Step, status: Status, message: String, accounts: List<Account>? = null) =
        Report(step, status, message.take(MAX_MESSAGE), accounts?.take(MAX_ACCOUNTS))
}
