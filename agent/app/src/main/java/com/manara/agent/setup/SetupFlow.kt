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

    /**
     * `accounts == null` leaves the server's stored lists unchanged. [signBackIn] stays on the
     * phone: the accounts still missing at the end, so its notice can open the right sign-in.
     */
    data class Report(
        val step: Step,
        val status: Status,
        val message: String,
        val accounts: List<Account>?,
        val signBackIn: List<Account> = emptyList(),
    )

    sealed interface Action {
        data object WaitForPairingCode : Action
        data object ListAccounts : Action
        /**
         * Turn these apps off for a moment (`pm disable-user`), then make Android recount accounts.
         * A disabled app's accounts stay on the phone, but Android stops counting them.
         */
        data class PauseApps(val packages: List<String>) : Action
        /** List again after a pause, while the parent removes accounts in Settings. */
        data object WaitThenListAccounts : Action
        data object SetDeviceOwner : Action
        /** Turn the paused apps back on: their accounts and data come back as they were. */
        data class ResumeApps(val packages: List<String>) : Action
        /** Turn wireless debugging off and delete Manara's adb key. */
        data object TurnOffWirelessDebugging : Action
        /** After a failure: turn [packages] back on (best effort), then turn wireless debugging off. */
        data class Recover(val packages: List<String>) : Action
        /** Read accounts through AccountManager; adb is already off by now. */
        data object WatchAccounts : Action
        data object Stop : Action
    }

    sealed interface Event {
        data object Paired : Event
        /**
         * [owners] maps each account type to the app currently registered for it: Android counts
         * only those accounts. [keepRunning] are apps never paused (the keyboard, home screen,
         * phone and SMS apps in use); [otherUsers] counts users besides the main one.
         */
        data class Accounts(
            val accounts: List<Account>,
            val owners: Map<String, String> = emptyMap(),
            val keepRunning: Set<String> = emptySet(),
            val otherUsers: Int = 0,
        ) : Event
        /** [refused]: apps Android would not turn off; their accounts go to the parent instead. */
        data class AppsPaused(val paused: List<String>, val refused: List<String> = emptyList()) : Event
        /** [isOwner]: Android itself says Manara is device owner now, whatever the shell printed. */
        data class DeviceOwnerOutput(val output: String, val isOwner: Boolean = false) : Event
        data object AppsResumed : Event
        data object WirelessDebuggingOff : Event
        /** The parent chose to finish without every account back. */
        data object ParentFinished : Event
        /** [stillPaused]: apps recovery could not turn back on; the parent is told which. */
        data class Recovered(val stillPaused: List<String> = emptyList()) : Event
        data class Failed(val message: String) : Event
    }

    data class State(
        val step: Step,
        val initialAccounts: List<Account>? = null,
        /** Apps turned off by this run and not yet back on: recovery turns these on. */
        val pausedApps: List<String> = emptyList(),
        /** Apps Android refused to turn off. */
        val cannotPause: Set<String> = emptySet(),
        /** Account types of the paused apps: they come back by themselves after resuming. */
        val pausedTypes: Set<String> = emptySet(),
        val failure: String? = null,
        /** Times `set-device-owner` was refused for an account Android still counts. */
        val ownerRetries: Int = 0,
        /** Times `set-device-owner` failed because Android was still removing the admin of the try before. */
        val removalWaits: Int = 0,
        /** What the phone had before an earlier run that didn't finish (from the server). */
        val earlierAccounts: List<Account> = emptyList(),
        /** Checks spent waiting for the paused apps' accounts to show again. */
        val returnChecks: Int = 0,
        /**
         * This phone counts accounts even while their app is paused (seen on the SM-A045F, a
         * Samsung on Android 14): the apps are back on and every account is the parent's to remove.
         */
        val pauseNotEnough: Boolean = false,
    )

    data class Transition(val state: State, val action: Action, val report: Report)

    const val MAX_MESSAGE = 300
    const val MAX_ACCOUNTS = 100
    private const val DEVICE_OWNER_SUCCESS = "Success: Device owner set to package "

    /**
     * Never turned off, even for a moment: Android itself, its Settings and phone, and Manara.
     * An account of theirs (rare) is left to the parent.
     */
    val NEVER_PAUSE = setOf(
        "android", "com.android.systemui", "com.android.settings", "com.android.phone",
        "com.android.shell", "com.manara.agent",
    )

    /**
     * The phone restarted during the reconnect step (on the SM-A045F the console then showed no
     * sign-in at all): watch again for what [initialAccounts] lists. Manara already manages the
     * phone and wireless debugging is off, so this step only reads accounts.
     */
    fun resumeReconnecting(initialAccounts: List<Account>): Transition = Transition(
        State(Step.RECONNECTING, initialAccounts = initialAccounts.distinct()),
        Action.WatchAccounts,
        report(Step.RECONNECTING, Status.IN_PROGRESS, "Checking which accounts are back."),
    )

    /** [earlierAccounts]: what an earlier, unfinished run found, so the parent can sign back in to all of it. */
    fun start(earlierAccounts: List<Account> = emptyList()): Transition = Transition(
        State(Step.PAIRING, earlierAccounts = earlierAccounts.distinct()),
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
                // Pausing wasn't enough on this phone: the apps are back on, now list what the parent removes.
                Event.AppsResumed -> if (state.pauseNotEnough) {
                    Transition(
                        state.copy(pausedApps = emptyList()),
                        Action.ListAccounts,
                        report(Step.WAITING_FOR_ACCOUNTS, Status.IN_PROGRESS, "Apps back on. Listing the accounts to remove."),
                    )
                } else {
                    unexpected(state, event)
                }
                is Event.AppsPaused -> if (state.step == Step.REMOVING_APP_ACCOUNTS) {
                    Transition(
                        // Every app was recorded as paused before trying; the refused ones are not off.
                        state.copy(
                            pausedApps = state.pausedApps - event.refused.toSet(),
                            cannotPause = state.cannotPause + event.refused,
                        ),
                        Action.ListAccounts,
                        report(Step.REMOVING_APP_ACCOUNTS, Status.IN_PROGRESS, "Apps paused. Checking that Android no longer counts their accounts."),
                    )
                } else {
                    unexpected(state, event)
                }
                else -> unexpected(state, event)
            }
            Step.DEVICE_OWNER -> when (event) {
                is Event.DeviceOwnerOutput -> if (event.isOwner || deviceOwnerSucceeded(event.output)) {
                    val next = state.copy(step = Step.RESTORING_APPS)
                    if (state.pausedApps.isEmpty()) {
                        Transition(next, Action.TurnOffWirelessDebugging,
                            report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Manara now manages the phone. Turning wireless debugging off."))
                    } else {
                        Transition(next, Action.ResumeApps(state.pausedApps),
                            report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Manara now manages the phone. Turning the paused apps back on."))
                    }
                } else if (adminBeingRemoved(event.output) && state.removalWaits < MAX_REMOVAL_WAITS) {
                    // Not a refusal: Android hadn't finished undoing the try before. Not counted as
                    // one either, so a slow undo can't make setup conclude that pausing isn't enough.
                    Transition(
                        state.copy(step = Step.CHECKING_ACCOUNTS, removalWaits = state.removalWaits + 1),
                        Action.WaitThenListAccounts,
                        report(Step.DEVICE_OWNER, Status.IN_PROGRESS, "Android is still undoing the last try. Trying again in a moment."),
                    )
                } else if (refusedForAccounts(event.output) && !state.pauseNotEnough && state.pausedApps.isNotEmpty() &&
                    state.ownerRetries >= PAUSE_RETRIES
                ) {
                    // Refused again with every counted app paused: this phone counts their accounts
                    // anyway. Turn them back on; the accounts themselves have to go, in Settings.
                    Transition(
                        state.copy(step = Step.WAITING_FOR_ACCOUNTS, pauseNotEnough = true, ownerRetries = 0, pausedTypes = emptySet()),
                        Action.ResumeApps(state.pausedApps),
                        report(Step.WAITING_FOR_ACCOUNTS, Status.IN_PROGRESS,
                            "This phone still counts accounts while their apps are paused. Turning the apps back on; the accounts have to be removed in Settings instead."),
                    )
                } else if (refusedForAccounts(event.output) && state.ownerRetries < MAX_OWNER_RETRIES) {
                    // Android answers from a count it refreshes in the background
                    // (DevicePolicyManagerService.mHasIncompatibleAccounts): look again shortly.
                    Transition(
                        state.copy(step = Step.CHECKING_ACCOUNTS, ownerRetries = state.ownerRetries + 1),
                        Action.WaitThenListAccounts,
                        report(Step.DEVICE_OWNER, Status.IN_PROGRESS, "Android still counts an account on the phone. Checking again in a moment."),
                    )
                } else {
                    fail(state, "Could not make Manara the phone manager: ${deviceOwnerError(event.output)}")
                }
                else -> unexpected(state, event)
            }
            Step.RESTORING_APPS -> when (event) {
                Event.AppsResumed -> Transition(
                    state.copy(pausedApps = emptyList()),
                    Action.TurnOffWirelessDebugging,
                    report(Step.RESTORING_APPS, Status.IN_PROGRESS, "Apps back on. Turning wireless debugging off."),
                )
                Event.WirelessDebuggingOff -> if (state.initialAccounts.isNullOrEmpty()) {
                    finished(state, emptyList())
                } else {
                    Transition(
                        state.copy(step = Step.RECONNECTING),
                        Action.WatchAccounts,
                        report(Step.RECONNECTING, Status.IN_PROGRESS, "Checking that every account is back."),
                    )
                }
                else -> unexpected(state, event)
            }
            Step.RECONNECTING -> when (event) {
                is Event.Accounts -> {
                    val current = event.accounts.distinct()
                    val missing = state.initialAccounts.orEmpty().filter { it !in current }
                    when {
                        missing.isEmpty() -> finished(state, current)
                        // A resumed app's accounts reappear by themselves, a moment later.
                        missing.all { it.type in state.pausedTypes } && state.returnChecks < MAX_RETURN_CHECKS -> Transition(
                            state.copy(returnChecks = state.returnChecks + 1), Action.WatchAccounts,
                            report(Step.RECONNECTING, Status.IN_PROGRESS, "Checking that every account is back.", current),
                        )
                        else -> Transition(state, Action.WatchAccounts,
                            report(Step.RECONNECTING, Status.WAITING_FOR_PARENT, RECONNECT_MESSAGE, current).copy(signBackIn = missing))
                    }
                }
                Event.ParentFinished -> finished(state, null)
                else -> unexpected(state, event)
            }
            Step.LINKED, Step.DONE -> unexpected(state, event)
        }
    }

    private const val RECONNECT_MESSAGE =
        "Sign back in to the accounts you removed and want to keep on this phone, then choose Finish setup in the console. You don't need to sign back in to all of them."

    /** Checks (one per watch, 5 s apart) a resumed app's accounts get to show again. */
    const val MAX_RETURN_CHECKS = 6

    /** Refusals with every counted app paused before concluding pausing isn't enough on this phone. */
    const val PAUSE_RETRIES = 2

    /** How many times a refusal for accounts is checked again before setup fails (5 s apart). */
    const val MAX_OWNER_RETRIES = 6

    /** The refusal printed by `dpm set-device-owner` when Android still counts an account (seen on the SM-A528B). */
    fun refusedForAccounts(output: String): Boolean =
        output.contains("already some accounts on the device") ||
            // After the cached count passes, Android 14 and 15 check accounts again, live
            // (DevicePolicyManagerService.hasAccountsOnAnyUser), and only return false; the shell
            // prints this. The only other false is a phone with no device admin feature at all.
            // Seen on the SM-A045F: another app had taken over a paused app's account type.
            (output.contains("Can't set package ") && output.contains(" as device owner."))

    /** Checks (5 s apart) for Android to finish removing the admin a refused try added. */
    const val MAX_REMOVAL_WAITS = 6

    /**
     * A refused try removes the admin it added, and Android finishes only once Manara has handled
     * DEVICE_ADMIN_DISABLED; a try before that fails at once with this (AOSP android14-release,
     * DevicePolicyManagerService.checkActiveAdminPrecondition). Seen on the SM-A528B, 2026-11-11:
     * the removal was still pending 7 s after the refusal, and setup gave up on it.
     */
    fun adminBeingRemoved(output: String): Boolean =
        output.contains("Trying to set an admin which is being removed")

    fun deviceOwnerSucceeded(output: String): Boolean =
        output.lineSequence().any { it.trim().startsWith(DEVICE_OWNER_SUCCESS) }

    /** The exception text the shell printed, or its first line. */
    fun deviceOwnerError(output: String): String {
        val lines = output.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        val exception = lines.firstOrNull { it.contains("Exception: ") }?.substringAfter("Exception: ")
        return exception ?: lines.firstOrNull() ?: "no output"
    }

    /**
     * Android counts only accounts whose app is registered right now (AOSP
     * AccountManagerService.getTypesVisibleToCaller), so an app turned off stops counting while
     * its accounts and data stay (validateAccountsInternal deletes nothing of an installed app).
     * Apps are paused only once nothing else blocks, right before device owner, to keep that
     * moment short. Verified on an Android 14 emulator, 2026-11-08 (docs/decisions/0006).
     */
    private fun onAccounts(state: State, event: Event.Accounts): Transition {
        val accounts = event.accounts.distinct()
        if (state.initialAccounts == null) {
            // The server keeps the first list it gets as "what was on the phone": send all of it once.
            return Transition(
                state.copy(initialAccounts = (state.earlierAccounts + accounts).distinct()),
                Action.ListAccounts,
                report(Step.CHECKING_ACCOUNTS, Status.IN_PROGRESS, "Found ${accounts.size} account(s) on the phone.", accounts),
            )
        }
        // An account with no registered app (orphaned, or its app paused) is not counted by stock
        // Android; a phone where pausing wasn't enough counts every stored account.
        val counted = if (state.pauseNotEnough) accounts else accounts.filter { it.type in event.owners }
        fun canPause(pkg: String?) = !state.pauseNotEnough && pkg != null &&
            pkg !in NEVER_PAUSE && pkg !in event.keepRunning && pkg !in state.cannotPause
        val manual = counted.filter { !canPause(event.owners[it.type]) }
        val toPause = counted.mapNotNull { event.owners[it.type] }.filter(::canPause).distinct() - state.pausedApps.toSet()
        // Facebook re-created its removed account 2 s after Manara's recount on the SM-A045F, and
        // device owner was refused again. Once nothing is stored, the apps that held the removed
        // accounts are paused for the last few seconds: they hold no account, so even a phone that
        // counts stored accounts lets device owner through, and paused they can't sign back in.
        val guard = if (!state.pauseNotEnough || manual.isNotEmpty() || event.otherUsers > 0) emptyList() else
            state.initialAccounts.orEmpty().mapNotNull { event.owners[it.type] }.distinct()
                .filter { it !in NEVER_PAUSE && it !in event.keepRunning && it !in state.cannotPause } - state.pausedApps.toSet()
        return when {
            // An account came back while its app was paused: Settings lists an account only while
            // its app is on, so turn the apps back on before asking the parent to remove it.
            manual.isNotEmpty() && state.pauseNotEnough && state.pausedApps.isNotEmpty() -> Transition(
                state.copy(step = Step.WAITING_FOR_ACCOUNTS),
                Action.ResumeApps(state.pausedApps),
                report(Step.WAITING_FOR_ACCOUNTS, Status.IN_PROGRESS, "An account came back. Turning the apps back on so it can be removed."),
            )
            manual.isNotEmpty() || event.otherUsers > 0 -> Transition(
                state.copy(step = Step.WAITING_FOR_ACCOUNTS),
                Action.WaitThenListAccounts,
                report(Step.WAITING_FOR_ACCOUNTS, Status.WAITING_FOR_PARENT, waitingMessage(manual.size, event.otherUsers, state.pauseNotEnough), manual),
            )
            // Recorded before any is touched: if the batch fails halfway, recovery turns them all back on.
            toPause.isNotEmpty() -> Transition(
                state.copy(
                    step = Step.REMOVING_APP_ACCOUNTS,
                    pausedApps = state.pausedApps + toPause,
                    pausedTypes = state.pausedTypes + counted.filter { event.owners[it.type] in toPause }.map { it.type },
                ),
                Action.PauseApps(toPause),
                report(Step.REMOVING_APP_ACCOUNTS, Status.IN_PROGRESS,
                    "Pausing ${toPause.size} app(s) that hold an account for a few seconds. Nothing is deleted: they come back on with their accounts and data."),
            )
            guard.isNotEmpty() -> Transition(
                state.copy(step = Step.REMOVING_APP_ACCOUNTS, pausedApps = state.pausedApps + guard),
                Action.PauseApps(guard),
                report(Step.REMOVING_APP_ACCOUNTS, Status.IN_PROGRESS,
                    "Accounts removed. Pausing ${guard.size} app(s) for a few seconds so none signs back in before Manara becomes the manager."),
            )
            else -> Transition(
                state.copy(step = Step.DEVICE_OWNER),
                Action.SetDeviceOwner,
                report(Step.DEVICE_OWNER, Status.IN_PROGRESS, "Making Manara the phone manager."),
            )
        }
    }

    private fun waitingMessage(manual: Int, otherUsers: Int, pauseNotEnough: Boolean): String = buildList {
        if (manual > 0) add(
            (if (pauseNotEnough) "This phone needs the $manual account(s) listed in the console removed for a moment. "
            else "Manara can't pause the app holding the $manual account(s) listed in the console. ") +
                "Check in the console how you'll get back in, then tap Open accounts and remove them. " +
                "Don't uninstall any app: the apps and their data stay.",
        )
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
            else -> Action.Recover(state.pausedApps)
        }
        return Transition(failed, action, report(state.step, Status.FAILED, message))
    }

    private fun recovering(state: State, event: Event): Transition = when (event) {
        is Event.Recovered -> {
            val message = if (event.stillPaused.isEmpty()) state.failure!! else
                "These apps may still be off: turn each back on in Settings, Apps: ${event.stillPaused.joinToString()}. ${state.failure}"
            Transition(state.copy(pausedApps = emptyList(), failure = message), Action.Stop, report(state.step, Status.FAILED, message))
        }
        else -> Transition(state, Action.Stop, report(state.step, Status.FAILED, state.failure!!))
    }

    private fun unexpected(state: State, event: Event) =
        fail(state, "Setup stopped: unexpected ${event::class.simpleName} during ${state.step.wire}.")

    private fun report(step: Step, status: Status, message: String, accounts: List<Account>? = null) =
        Report(step, status, message.take(MAX_MESSAGE), accounts?.take(MAX_ACCOUNTS))
}
