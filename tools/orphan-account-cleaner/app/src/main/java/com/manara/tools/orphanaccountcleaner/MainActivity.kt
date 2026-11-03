package com.manara.tools.orphanaccountcleaner

import android.accounts.AccountManager
import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * One button: find every account of the types this app registered an
 * authenticator for (AndroidManifest.xml) and remove it. Built for the
 * specific orphaned-account problem documented in
 * ../../docs/enrollment-options.md -- an account whose owning app was
 * uninstalled doesn't always get purged from AccountManager on its own,
 * which blocks ADR-0003's account-removal enrollment even though neither
 * `adb` nor Settings' own Accounts UI can touch it. Registering as the
 * authenticator for that type is enough to call removeAccountExplicitly()
 * on it directly.
 */
class MainActivity : Activity() {

    private val knownTypes = listOf(
        "com.whatsapp",
        "com.google.android.apps.tachyon",
        "com.truecaller.account",
        "com.facebook.auth.login",
        "com.facebook.messenger",
        // Only removable while GMS/GSF are disabled (no competing
        // registered authenticator) -- see the manifest's comment.
        "com.google"
    )

    private lateinit var output: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val padding = (16 * resources.displayMetrics.density).toInt()

        output = TextView(this).apply {
            text = "Tap the button to scan for and remove orphaned accounts of:\n" +
                knownTypes.joinToString("\n") { "  - $it" }
            setPadding(padding, padding, padding, padding)
        }

        val button = Button(this).apply {
            text = "Remove orphaned accounts"
            setOnClickListener { removeOrphanedAccounts() }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(button)
            addView(output)
        }

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun removeOrphanedAccounts() {
        val accountManager = AccountManager.get(this)
        val report = StringBuilder()
        var totalFound = 0
        var totalRemoved = 0

        for (type in knownTypes) {
            val accounts = accountManager.getAccountsByType(type)
            if (accounts.isEmpty()) {
                report.append("$type: none found\n")
                continue
            }
            for (account in accounts) {
                totalFound++
                val removed = try {
                    accountManager.removeAccountExplicitly(account)
                } catch (e: SecurityException) {
                    report.append("$type (${account.name}): FAILED -- ${e.message}\n")
                    continue
                }
                if (removed) {
                    totalRemoved++
                    report.append("$type (${account.name}): removed\n")
                } else {
                    report.append("$type (${account.name}): removeAccountExplicitly returned false\n")
                }
            }
        }

        report.append("\n$totalRemoved/$totalFound removed. Re-run scripts/enroll-preflight.sh to confirm.")
        output.text = report.toString()
    }
}
