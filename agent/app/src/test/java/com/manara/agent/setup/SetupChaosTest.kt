package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.fail
import org.junit.Test
import kotlin.random.Random

/**
 * Guided setup against thousands of randomly misbehaving phones and parents, through the real
 * [SetupRunner] and [SetupFlow]. Each run checks the rules that must hold whatever happens:
 *
 * 1. No app is uninstalled while an account the parent must remove, an orphaned account or
 *    another user is on the phone (apps go last: their data goes with them).
 * 2. Device owner is only attempted right after an empty account list.
 * 3. Every app setup uninstalled is installed again at the end, unless putting it back failed
 *    on every attempt (then the test counts it, to show how rare that is).
 * 4. Wireless debugging is turned off at the end of every run that paired.
 * 5. The "sign back in" list keeps everything the phone had: an earlier run's accounts and the
 *    first list.
 * 6. Nothing destructive happens after a failure is reported, and "done" means device owner.
 *
 * A failure prints the seed, so the exact run can be replayed.
 */
class SetupChaosTest {

    private class Stop : CancellationException("parent left; the run is cut here")

    private class Sim(seed: Long) : SetupDevice {
        val rnd = Random(seed)
        val violations = mutableListOf<String>()
        val log = mutableListOf<String>()

        // The phone.
        private val gms = "com.google.android.gms"
        private val osp = "com.osp.app.signin"
        val systemOwners = mapOf("com.google" to gms, "com.osp.app.signin" to osp)
        val appTypes = mapOf("com.whatsapp" to "com.whatsapp", "www.instagram.com" to "com.instagram.android", "com.facebook.auth.login" to "com.facebook.katana")
        val accounts = mutableListOf<Account>()
        val installed = mutableSetOf("com.android.chrome")
        var otherUsers = if (rnd.nextDouble() < 0.1) 1 else 0
        val lingerFor = mutableMapOf<String, Int>() // type -> lists left before Android forgets it
        val uninstalled = mutableSetOf<String>()
        val restoreFailures = mutableMapOf<String, Int>()
        var deviceOwner = false
        var paired = false
        var adbOffCalls = 0
        var lastListEmpty = false
        var failedReported = false
        var parentGone = false
        var calls = 0
        val firstSeen = mutableListOf<Account>()
        var listed = false

        init {
            repeat(rnd.nextInt(0, 3)) { accounts += Account("com.google", "kid$it@gmail.com") }
            if (rnd.nextBoolean()) accounts += Account("com.osp.app.signin", "kid@samsung")
            appTypes.forEach { (type, pkg) ->
                if (rnd.nextDouble() < 0.5) { installed += pkg; accounts += Account(type, pkg.substringAfterLast('.')) }
                else if (rnd.nextDouble() < 0.3) installed += pkg // installed, no account
            }
            if (rnd.nextDouble() < 0.15) accounts += Account("com.gone.app", "orphan") // no authenticator at all
        }

        private fun flaky(name: String, p: Double) {
            calls++
            if (calls > 600) throw Stop()
            log += name
            if (rnd.nextDouble() < p) error("$name: simulated failure")
        }

        private fun mustRemove(): List<Account> = accounts.filter { a ->
            a.type !in lingerFor && (a.type in systemOwners || owner(a.type) == null)
        }

        private fun owner(type: String): String? =
            systemOwners[type] ?: appTypes[type]?.takeIf { it in installed }

        /** The parent acts between two polls: removes accounts, the extra user, sometimes adds one or leaves. */
        private fun parentActs() {
            if (parentGone) return
            if (rnd.nextDouble() < 0.01) { parentGone = true; return }
            mustRemove().firstOrNull()?.takeIf { rnd.nextDouble() < 0.5 }?.let { accounts -= it }
            if (otherUsers > 0 && rnd.nextDouble() < 0.3) otherUsers = 0
            if (rnd.nextDouble() < 0.02) accounts += Account("com.google", "surprise${rnd.nextInt(100)}@gmail.com")
        }

        override suspend fun pairAndConnect() { flaky("pair", 0.05); paired = true }

        override suspend fun listAccounts(): SetupFlow.Event.Accounts {
            flaky("list", 0.03)
            parentActs()
            // Android forgets an uninstalled app's account a few lists later.
            lingerFor.keys.toList().forEach { type ->
                val left = lingerFor.getValue(type) - 1
                if (left <= 0) { lingerFor -= type; accounts.removeAll { it.type == type } } else lingerFor[type] = left
            }
            val now = accounts.toList()
            if (!listed) { firstSeen += now; listed = true }
            lastListEmpty = now.isEmpty() && otherUsers == 0
            val owners = now.mapNotNull { a -> owner(a.type)?.let { a.type to it } }.toMap()
            val userApps = installed - setOf(gms, osp)
            return SetupFlow.Event.Accounts(now, owners, userApps, otherUsers)
        }

        override suspend fun backUpAndUninstall(packages: List<String>) {
            calls++
            log += "uninstall $packages"
            if (failedReported) violations += "uninstalled after a failure was reported"
            if (mustRemove().isNotEmpty()) violations += "uninstalled $packages while ${mustRemove()} remained"
            if (otherUsers > 0) violations += "uninstalled $packages while another user was on the phone"
            for (pkg in packages) {
                if (rnd.nextDouble() < 0.05) error("uninstall $pkg: simulated failure")
                installed -= pkg
                uninstalled += pkg
                appTypes.filterValues { it == pkg }.keys.forEach { type ->
                    if (accounts.any { it.type == type }) lingerFor[type] = rnd.nextInt(0, 12)
                }
            }
        }

        override suspend fun setDeviceOwner(): String {
            flaky("owner", 0.0)
            if (failedReported) violations += "device owner tried after a failure was reported"
            if (!lastListEmpty) violations += "device owner tried without an empty account list just before"
            return when {
                accounts.isNotEmpty() -> "java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device."
                otherUsers > 0 -> "java.lang.IllegalStateException: Not allowed to set the device owner because there are already several users on the device."
                rnd.nextDouble() < 0.03 -> "java.lang.IllegalStateException: something unexpected"
                else -> { deviceOwner = true; "Success: Device owner set to package com.manara.agent/.OwnerReceiver" }
            }
        }

        /** Same contract as AdbSetupDevice: every app is tried, installed ones are skipped, failures thrown at the end. */
        override suspend fun restoreApps(packages: List<String>) {
            calls++
            log += "restore $packages"
            val failed = packages.filter { pkg ->
                when {
                    pkg in installed -> false
                    rnd.nextDouble() < 0.05 -> { restoreFailures.merge(pkg, 1, Int::plus); true }
                    else -> { installed += pkg; false }
                }
            }
            if (failed.isNotEmpty()) error("restore $failed: simulated failure")
        }

        override suspend fun turnOffWirelessDebugging() { adbOffCalls++; flaky("adb off", 0.05) }

        override suspend fun watchAccounts(): List<Account>? {
            flaky("watch", 0.03)
            if (!parentGone && rnd.nextDouble() < 0.15) return null // the parent chose Finish
            if (!parentGone && rnd.nextDouble() < 0.4) firstSeen.randomOrNull(rnd)?.let { if (it !in accounts) accounts += it }
            return accounts.toList()
        }
    }

    @Test
    fun `setup holds its rules on thousands of misbehaving phones and parents`() {
        var notRestored = 0
        var finished = 0
        var failedRuns = 0
        for (seed in 1L..5000L) {
            val sim = Sim(seed)
            val earlier = if (sim.rnd.nextDouble() < 0.3) listOf(Account("com.google", "before@gmail.com")) else emptyList()
            val reports = mutableListOf<SetupFlow.Report>()
            val state = try {
                runBlocking {
                    SetupRunner(sim, report = { r ->
                        if (sim.failedReported && r.status != SetupFlow.Status.FAILED) sim.violations += "reported ${r.status} after a failure"
                        if (r.status == SetupFlow.Status.FAILED) sim.failedReported = true
                        if (r.status == SetupFlow.Status.DONE && !sim.deviceOwner) sim.violations += "reported done without device owner"
                        reports += r
                    }, pollMillis = 0, earlierAccounts = earlier, log = { _, _ -> }).run()
                }
            } catch (stop: Stop) {
                null // the parent left mid-way: only the rules checked along the way apply
            } catch (other: Throwable) {
                fail("seed $seed: run() threw $other\n${sim.log.joinToString("\n")}"); return
            }

            if (state != null) {
                if (state.step == SetupFlow.Step.DONE) finished++ else failedRuns++
                if (sim.paired && sim.adbOffCalls == 0) sim.violations += "wireless debugging never turned off"
                val missing = sim.uninstalled - sim.installed
                missing.forEach { pkg ->
                    // Lost only if every try failed, in the normal step and again in recovery.
                    if ((sim.restoreFailures[pkg] ?: 0) >= SetupRunner.ATTEMPTS) notRestored++
                    else sim.violations += "$pkg was uninstalled and not put back (restore failures: ${sim.restoreFailures[pkg] ?: 0})"
                }
                val initial = state.initialAccounts
                if (initial != null && !initial.containsAll(earlier + sim.firstSeen)) {
                    sim.violations += "sign-back-in list $initial lost some of ${earlier + sim.firstSeen}"
                }
            }
            if (sim.violations.isNotEmpty()) {
                fail("seed $seed: ${sim.violations.distinct().joinToString("; ")}\n--- calls:\n${sim.log.joinToString("\n")}\n--- reports:\n${reports.joinToString("\n") { "${it.step} ${it.status} ${it.message}" }}")
            }
        }
        println("chaos: $finished finished, $failedRuns failed safely, $notRestored app(s) left out after every restore attempt failed")
    }
}
