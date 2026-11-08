package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account

/** The phone-side operations guided setup needs; each maps to one fixed [SetupFlow.Action]. */
interface SetupDevice {
    /** Waits for the parent's pairing code, pairs with this phone's wireless debugging and connects. */
    suspend fun pairAndConnect()
    suspend fun listAccounts(): SetupFlow.Event.Accounts
    /**
     * Turns each app off (safe to repeat), then makes Android recount accounts. Returns the apps
     * Android refused to turn off.
     */
    suspend fun pauseApps(packages: List<String>): List<String>
    /** Makes Android recount accounts, then runs `dpm set-device-owner` and returns its raw output. */
    suspend fun setDeviceOwner(): String
    /** Turns each app back on (safe to repeat). Tries every one, and throws at the end naming those that failed. */
    suspend fun resumeApps(packages: List<String>)
    suspend fun turnOffWirelessDebugging()
    /** Accounts seen through AccountManager, or null once the parent tapped "Finish". */
    suspend fun watchAccounts(): List<Account>?
}
