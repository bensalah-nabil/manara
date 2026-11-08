package com.manara.agent.setup

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.accounts.AccountManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.IBinder
import android.util.Log

/**
 * Makes Android recount accounts before `set-device-owner`.
 *
 * On adb, DevicePolicyManagerService answers "are there accounts?" from a cached count
 * (`mHasIncompatibleAccounts`), refreshed only at boot and on `LOGIN_ACCOUNTS_CHANGED_ACTION`
 * (AOSP android14-release and android15-release). Turning an app off deletes none of its accounts,
 * so nothing refreshes that count, and set-device-owner keeps refusing for accounts Android no longer
 * counts. Adding and removing an account of Manara's own type sends that broadcast: seen on an
 * Android 14 emulator, "Finished calculating hasIncompatibleAccountsTask", then set-device-owner
 * succeeded with a paused app's account still on the phone.
 */
object AccountRecount {
    const val TYPE = "com.manara.agent.setup"
    private const val TAG = "ManaraSetup"

    /** Returns false if Android refused either step; setup then relies on its own retries. */
    fun trigger(context: Context): Boolean {
        val manager = AccountManager.get(context)
        val account = Account("recount", TYPE)
        val added = manager.addAccountExplicitly(account, null, null)
        val removed = manager.removeAccountExplicitly(account)
        if (!added || !removed) Log.w(TAG, "recount: added=$added removed=$removed")
        return added && removed
    }
}

/** The authenticator Android requires for [AccountRecount.TYPE]; it never creates or signs in anything. */
class RecountAuthenticatorService : Service() {
    private val authenticator by lazy { NoAccounts(this) }
    override fun onBind(intent: Intent?): IBinder? = authenticator.iBinder

    private class NoAccounts(context: Context) : AbstractAccountAuthenticator(context) {
        private fun refused() = Bundle().apply {
            putInt(AccountManager.KEY_ERROR_CODE, AccountManager.ERROR_CODE_UNSUPPORTED_OPERATION)
            putString(AccountManager.KEY_ERROR_MESSAGE, "Manara holds no accounts.")
        }
        override fun editProperties(response: AccountAuthenticatorResponse?, accountType: String?): Bundle = refused()
        override fun addAccount(response: AccountAuthenticatorResponse?, accountType: String?, authTokenType: String?, requiredFeatures: Array<out String>?, options: Bundle?): Bundle = refused()
        override fun confirmCredentials(response: AccountAuthenticatorResponse?, account: Account?, options: Bundle?): Bundle = refused()
        override fun getAuthToken(response: AccountAuthenticatorResponse?, account: Account?, authTokenType: String?, options: Bundle?): Bundle = refused()
        override fun getAuthTokenLabel(authTokenType: String?): String? = null
        override fun updateCredentials(response: AccountAuthenticatorResponse?, account: Account?, authTokenType: String?, options: Bundle?): Bundle = refused()
        override fun hasFeatures(response: AccountAuthenticatorResponse?, account: Account?, features: Array<out String>?): Bundle =
            Bundle().apply { putBoolean(AccountManager.KEY_BOOLEAN_RESULT, false) }
    }
}
