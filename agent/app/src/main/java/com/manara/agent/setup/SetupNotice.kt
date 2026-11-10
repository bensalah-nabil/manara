package com.manara.agent.setup

import com.manara.agent.R

/**
 * Which screen guided setup's notice offers to open, so the parent never hunts through Settings.
 * Pure; SetupService turns the answer into a notification button.
 */
object SetupNotice {

    sealed interface Button {
        /** A string resource; SetupService reads it in the phone's language. */
        val label: Int
    }

    /** Settings' account list, where the parent removes the accounts listed in the console. */
    data object OpenAccounts : Button {
        override val label = R.string.setup_open_accounts
    }

    /** Android's "add account" screen, limited to [types]. */
    data class AddAccount(val types: List<String>) : Button {
        override val label = if (types == listOf(GOOGLE)) R.string.setup_add_google else R.string.setup_add_account
    }

    const val GOOGLE = "com.google"

    fun buttonFor(report: SetupFlow.Report): Button? {
        if (report.status != SetupFlow.Status.WAITING_FOR_PARENT) return null
        return when (report.step) {
            SetupFlow.Step.WAITING_FOR_ACCOUNTS -> OpenAccounts.takeIf { !report.accounts.isNullOrEmpty() }
            SetupFlow.Step.RECONNECTING -> {
                val types = report.signBackIn.map { it.type }.distinct()
                when {
                    types.isEmpty() -> null
                    // Google first: its passwords bring the other apps' back with them.
                    GOOGLE in types -> AddAccount(listOf(GOOGLE))
                    else -> AddAccount(types)
                }
            }
            else -> null
        }
    }
}
