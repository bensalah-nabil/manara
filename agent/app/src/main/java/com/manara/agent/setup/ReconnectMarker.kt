package com.manara.agent.setup

import android.content.Context
import android.util.Log
import com.manara.agent.setup.AccountDump.Account
import java.io.File

/**
 * Remembers that guided setup is in its reconnect step, and what to watch for, so the watch
 * resumes after the phone restarts. On the SM-A045F the phone was turned off during that step;
 * nothing restarted the watch, and the console never saw the parent sign back in to Google.
 *
 * Holds only account types and names, the same the console already shows, in Manara's own
 * private storage, and only until setup finishes. Pure; [Store] does the file I/O.
 */
object ReconnectMarker {

    /** The accounts to keep watching for in [state], or null when nothing should be resumed. */
    fun toKeep(state: SetupFlow.State): List<Account>? =
        state.initialAccounts?.takeIf { state.step == SetupFlow.Step.RECONNECTING && state.failure == null && it.isNotEmpty() }

    /** One account per line, type and name separated by a tab. */
    fun encode(accounts: List<Account>): String =
        accounts.filter { it.type.none(::isBreak) && it.name.none(::isBreak) }
            .joinToString("") { "${it.type}\t${it.name}\n" }

    fun decode(text: String): List<Account> = text.lineSequence().mapNotNull { line ->
        val parts = line.split('\t')
        if (parts.size == 2 && parts[0].isNotEmpty()) Account(parts[0], parts[1]) else null
    }.toList()

    private fun isBreak(c: Char) = c == '\t' || c == '\n' || c == '\r'

    class Store(context: Context) {
        private val file = File(context.filesDir, "setup-reconnecting.txt")

        fun load(): List<Account>? = try {
            if (file.exists()) decode(file.readText()).takeIf { it.isNotEmpty() } else null
        } catch (error: Exception) {
            Log.w("ManaraSetup", "reconnect list not read", error)
            null
        }

        /** Saves [accounts], or forgets the step when null. */
        fun keep(accounts: List<Account>?) {
            try {
                if (accounts == null) file.delete() else if (load() != accounts) file.writeText(encode(accounts))
            } catch (error: Exception) {
                Log.w("ManaraSetup", "reconnect list not saved", error)
            }
        }
    }
}
