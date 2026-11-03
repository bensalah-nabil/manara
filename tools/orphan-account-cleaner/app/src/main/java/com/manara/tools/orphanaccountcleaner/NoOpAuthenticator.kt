package com.manara.tools.orphanaccountcleaner

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.accounts.AccountManager
import android.content.Context
import android.os.Bundle

/**
 * Registering as the authenticator for a type is all MainActivity needs
 * in order to call removeAccountExplicitly() on an orphaned account of
 * that type -- this tool never adds, authenticates, or stores anything,
 * so every other AbstractAccountAuthenticator method is a deliberate no-op.
 */
class NoOpAuthenticator(context: Context) : AbstractAccountAuthenticator(context) {

    override fun editProperties(response: AccountAuthenticatorResponse?, accountType: String?): Bundle = Bundle()

    override fun addAccount(
        response: AccountAuthenticatorResponse?,
        accountType: String?,
        authTokenType: String?,
        requiredFeatures: Array<out String>?,
        options: Bundle?
    ): Bundle = unsupported()

    override fun confirmCredentials(response: AccountAuthenticatorResponse?, account: Account?, options: Bundle?): Bundle? = null

    override fun getAuthToken(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        authTokenType: String?,
        options: Bundle?
    ): Bundle = unsupported()

    override fun getAuthTokenLabel(authTokenType: String?): String? = null

    override fun updateCredentials(
        response: AccountAuthenticatorResponse?,
        account: Account?,
        authTokenType: String?,
        options: Bundle?
    ): Bundle? = null

    override fun hasFeatures(response: AccountAuthenticatorResponse?, account: Account?, features: Array<out String>?): Bundle {
        val result = Bundle()
        result.putBoolean(AccountManager.KEY_BOOLEAN_RESULT, false)
        return result
    }

    private fun unsupported(): Bundle {
        val result = Bundle()
        result.putInt(AccountManager.KEY_ERROR_CODE, AccountManager.ERROR_CODE_UNSUPPORTED_OPERATION)
        result.putString(AccountManager.KEY_ERROR_MESSAGE, "orphan-account-cleaner only removes existing accounts")
        return result
    }
}
