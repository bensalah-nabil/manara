package com.manara.agent.setup

/** Parsing for what the parent types and what `pm` prints; kept pure so it is unit-tested. */
object SetupInput {

    private val PACKAGE_NAME = Regex("""^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$""")
    private val APK_PATH = Regex("""^/[A-Za-z0-9._/=~+-]+\.apk$""")

    /** At most this many pairings are tried before setup stops; each "Pair" tap shows a new code. */
    const val PAIRING_ATTEMPTS = 5

    private val PAIRING_CODE = Regex("""^\d{6}$""")

    /** The six digits "Pair device with pairing code" shows. */
    fun isPairingCode(text: String): Boolean = PAIRING_CODE.matches(text)

    /** The values of `package:` lines, as printed by `pm list packages` and `pm path`. */
    fun packageLines(output: String): List<String> =
        output.lineSequence().map { it.trim() }.filter { it.startsWith("package:") }
            .map { it.removePrefix("package:") }.filter { it.isNotEmpty() }.toList()

    // Only these values are ever put into a shell command.
    fun isSafePackageName(name: String): Boolean = PACKAGE_NAME.matches(name)

    fun isSafeApkPath(path: String): Boolean = APK_PATH.matches(path) && ".." !in path

    /** `pm install` and `pm uninstall` print a line that is exactly "Success" when they succeed. */
    fun pmSucceeded(output: String): Boolean = output.lineSequence().any { it.trim() == "Success" }

    /**
     * `pm disable-user` and `pm enable` print "Package <pkg> new state: <state>" (AOSP
     * PackageManagerShellCommand.runSetEnabledSetting); seen on an Android 14 emulator.
     */
    fun pmNewState(output: String, pkg: String, state: String): Boolean =
        output.lineSequence().any { it.trim() == "Package $pkg new state: $state" }

    /** The package of `settings get secure default_input_method` ("pkg/.Service"), or null. */
    fun imePackage(setting: String): String? =
        setting.trim().substringBefore('/').takeIf { '/' in setting && isSafePackageName(it) }

    /** `cmd role get-role-holders` prints one package per line. */
    fun roleHolders(output: String): List<String> =
        output.lineSequence().map { it.trim() }.filter(::isSafePackageName).toList()
}
