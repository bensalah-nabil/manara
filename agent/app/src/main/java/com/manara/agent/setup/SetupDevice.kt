package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account

/** The phone-side operations guided setup needs; each maps to one fixed [SetupFlow.Action]. */
interface SetupDevice {
    /** Waits for the parent's pairing code, pairs with this phone's wireless debugging and connects. */
    suspend fun pairAndConnect()
    suspend fun listAccounts(): SetupFlow.Event.Accounts
    suspend fun backUpAndUninstall(packages: List<String>)
    /** The raw output of `dpm set-device-owner`. */
    suspend fun setDeviceOwner(): String
    suspend fun restoreApps(packages: List<String>)
    suspend fun turnOffWirelessDebugging()
    /** Accounts seen through AccountManager, or null once the parent tapped "Finish". */
    suspend fun watchAccounts(): List<Account>?
}
