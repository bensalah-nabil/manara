package com.manara.agent.setup

/**
 * Reads `adb shell dumpsys account`. Format from AccountManagerService.dump/dumpUser and
 * RegisteredServicesCache.dump (AOSP android14-release), checked on a Samsung A52 (Android 14):
 * one `User UserInfo{id:name:flags}:` header per user, then `Accounts: N` and N lines of
 * `Account {name=..., type=...}`, then later sections including one
 * `ServiceInfo: AuthenticatorDescription {type=...}, ComponentInfo{package/class}, uid N`
 * line per registered account authenticator.
 */
object AccountDump {

    data class Account(val type: String, val name: String)

    /** [owners] maps each account type to the package of the app that registered it. */
    data class UserAccounts(val userId: Int, val accounts: List<Account>, val owners: Map<String, String>)

    class FormatException(message: String) : Exception(message)

    private val USER = Regex("""^User UserInfo\{(\d+):.*\}:$""")
    private val COUNT = Regex("""^Accounts: (\d+)$""")
    // Greedy name: a name containing ", type=" still splits at the last one.
    private val ACCOUNT = Regex("""^Account \{name=(.*), type=(.*)\}$""")
    private val OWNER = Regex("""^ServiceInfo: AuthenticatorDescription \{type=(.*)\}, ComponentInfo\{([^/]+)/.*\}, uid \d+$""")

    fun parse(output: String): List<UserAccounts> {
        val lines = output.lines().map { it.trim() }
        val users = mutableListOf<UserAccounts>()
        var userId: Int? = null
        var accounts: List<Account>? = null
        val owners = mutableMapOf<String, String>()

        fun closeUser() {
            val id = userId ?: return
            users += UserAccounts(id, accounts ?: throw FormatException("no account count for user $id"), owners.toMap())
        }

        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            val header = USER.matchEntire(line)
            val count = COUNT.matchEntire(line)
            when {
                header != null -> {
                    closeUser()
                    userId = header.groupValues[1].toInt()
                    accounts = null
                    owners.clear()
                }
                userId != null && accounts == null && count != null -> {
                    val n = count.groupValues[1].toInt()
                    if (index + n >= lines.size) throw FormatException("user $userId lists fewer than $n accounts")
                    accounts = (1..n).map { offset ->
                        val match = ACCOUNT.matchEntire(lines[index + offset])
                            ?: throw FormatException("unexpected account line for user $userId")
                        Account(type = match.groupValues[2], name = match.groupValues[1])
                    }
                    index += n
                }
                userId != null -> OWNER.matchEntire(line)?.let { owners[it.groupValues[1]] = it.groupValues[2] }
            }
            index++
        }
        closeUser()
        if (users.isEmpty()) throw FormatException("no users in output")
        return users
    }
}
