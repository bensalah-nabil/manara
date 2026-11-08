package com.manara.fixture

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.accounts.AccountManager
import android.app.Activity
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import java.io.File

/** Test-only: adds one account of its own type and writes a data file, so a test can see what survives. */
class AddActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val added = AccountManager.get(this).addAccountExplicitly(Account("child@fixture.test", "com.manara.fixture"), "secret", null)
        File(filesDir, "marker.txt").writeText("app data kept")
        Log.i("Fixture", "account added=$added")
        finish()
    }
}

class AuthService : Service() {
    override fun onBind(intent: Intent?) = Auth(this).iBinder
}

class Auth(context: Context) : AbstractAccountAuthenticator(context) {
    override fun editProperties(r: AccountAuthenticatorResponse?, t: String?) = Bundle()
    override fun addAccount(r: AccountAuthenticatorResponse?, t: String?, a: String?, f: Array<out String>?, o: Bundle?) = Bundle()
    override fun confirmCredentials(r: AccountAuthenticatorResponse?, a: Account?, o: Bundle?): Bundle? = null
    override fun getAuthToken(r: AccountAuthenticatorResponse?, a: Account?, t: String?, o: Bundle?) = Bundle()
    override fun getAuthTokenLabel(t: String?): String? = null
    override fun updateCredentials(r: AccountAuthenticatorResponse?, a: Account?, t: String?, o: Bundle?) = Bundle()
    override fun hasFeatures(r: AccountAuthenticatorResponse?, a: Account?, f: Array<out String>?) =
        Bundle().apply { putBoolean(AccountManager.KEY_BOOLEAN_RESULT, false) }
}
