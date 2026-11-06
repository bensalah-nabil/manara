package com.manara.agent.setup

/** Parsing for what the parent types and what `pm` prints; kept pure so it is unit-tested. */
object SetupInput {

    /** The six-digit code and the port shown together in Android's "Pair with pairing code" dialog. */
    data class Pairing(val code: String, val port: Int)

    private val PAIRING = Regex("""^\s*(\d{6})\s*[\s:,;]\s*(\d{1,5})\s*$""")
    private val PACKAGE_NAME = Regex("""^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$""")
    private val APK_PATH = Regex("""^/[A-Za-z0-9._/=~+-]+\.apk$""")

    /** Accepts "123456 41235", "123456:41235" or "123456,41235"; null if it is not that. */
    fun parsePairing(text: String): Pairing? {
        val match = PAIRING.matchEntire(text) ?: return null
        val port = match.groupValues[2].toInt()
        return if (port in 1..65535) Pairing(match.groupValues[1], port) else null
    }

    /** The values of `package:` lines, as printed by `pm list packages` and `pm path`. */
    fun packageLines(output: String): List<String> =
        output.lineSequence().map { it.trim() }.filter { it.startsWith("package:") }
            .map { it.removePrefix("package:") }.filter { it.isNotEmpty() }.toList()

    // Only these values are ever put into a shell command.
    fun isSafePackageName(name: String): Boolean = PACKAGE_NAME.matches(name)

    fun isSafeApkPath(path: String): Boolean = APK_PATH.matches(path) && ".." !in path

    /** `pm install` and `pm uninstall` print a line that is exactly "Success" when they succeed. */
    fun pmSucceeded(output: String): Boolean = output.lineSequence().any { it.trim() == "Success" }
}
