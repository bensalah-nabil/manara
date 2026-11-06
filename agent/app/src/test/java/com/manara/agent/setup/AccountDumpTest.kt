package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class AccountDumpTest {

    // Shape from AccountManagerService.dump/dumpUser (android14-release); authenticator lines copied
    // from a real A52 dump; other sections trimmed.
    private val twoUsers = """
        User UserInfo{0:Owner:c13}:
          Accounts: 3
            Account {name=kid@gmail.com, type=com.google}
            Account {name=WhatsApp, type=com.whatsapp}
            Account {name=kid, type=x, type=com.example}

          AccountId, Action_Type, timestamp, UID, TableName, Key
            Account Id: 1, action: action_account_add

          Active Sessions: 0

          RegisteredServicesCache: 2 services
            ServiceInfo: AuthenticatorDescription {type=com.whatsapp}, ComponentInfo{com.whatsapp/com.whatsapp.accountsync.AccountAuthenticatorService}, uid 10312
            ServiceInfo: AuthenticatorDescription {type=com.google}, ComponentInfo{com.google.android.gms/com.google.android.gms.auth.account.authenticator.GoogleAccountAuthenticatorService}, uid 10249

        User UserInfo{10:Work:30}:
          Accounts: 0

          Active Sessions: 0

          RegisteredServicesCache: 1 services
            ServiceInfo: AuthenticatorDescription {type=www.instagram.com}, ComponentInfo{com.instagram.android/com.instagram.libraries.access.accountmanager.service.InstagramAuthenticationService}, uid 1010359
    """.trimIndent()

    @Test
    fun `reads each user's counted accounts and ignores the debug table`() {
        val users = AccountDump.parse(twoUsers)
        assertEquals(listOf(0, 10), users.map { it.userId })
        assertEquals(
            listOf(
                Account("com.google", "kid@gmail.com"),
                Account("com.whatsapp", "WhatsApp"),
                Account("com.example", "kid, type=x"),
            ),
            users[0].accounts,
        )
        assertEquals(emptyList<Account>(), users[1].accounts)
    }

    @Test
    fun `each user's authenticators map account types to the app that owns them`() {
        val users = AccountDump.parse(twoUsers)
        assertEquals(mapOf("com.whatsapp" to "com.whatsapp", "com.google" to "com.google.android.gms"), users[0].owners)
        assertEquals(mapOf("www.instagram.com" to "com.instagram.android"), users[1].owners)
    }

    @Test
    fun `Windows line endings from adb are accepted`() {
        val users = AccountDump.parse(twoUsers.replace("\n", "\r\n"))
        assertEquals(3, users[0].accounts.size)
    }

    @Test
    fun `fewer account lines than the count is an error, not a shorter list`() {
        val truncated = "User UserInfo{0:Owner:c13}:\n  Accounts: 2\n    Account {name=a, type=com.google}"
        assertThrows(AccountDump.FormatException::class.java) { AccountDump.parse(truncated) }
    }

    @Test
    fun `an unexpected line where an account should be is an error`() {
        val odd = "User UserInfo{0:Owner:c13}:\n  Accounts: 1\n    something else\n"
        assertThrows(AccountDump.FormatException::class.java) { AccountDump.parse(odd) }
    }

    @Test
    fun `no user at all is an error, so a failed command never reads as zero accounts`() {
        assertThrows(AccountDump.FormatException::class.java) { AccountDump.parse("Permission Denial: can't dump") }
        assertThrows(AccountDump.FormatException::class.java) { AccountDump.parse("") }
    }

    @Test
    fun `a user header without a count is an error`() {
        assertThrows(AccountDump.FormatException::class.java) {
            AccountDump.parse("User UserInfo{0:Owner:c13}:\n\nUser UserInfo{10:Work:30}:\n  Accounts: 0\n")
        }
    }
}
