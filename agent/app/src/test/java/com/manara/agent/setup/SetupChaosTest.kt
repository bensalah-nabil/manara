package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.fail
import org.junit.Test
import kotlin.random.Random

/**
 * Guided setup against thousands of randomly misbehaving phones and parents, through the real
 * [SetupRunner] and [SetupFlow]. The simulated phone follows what Android does (AOSP, checked on
 * an Android 14 emulator): a paused app's accounts stay but are not counted, an account with no
 * registered app is not counted, and set-device-owner sometimes answers from a stale count.
 * Each run checks the rules that must hold whatever happens:
 *
 * 1. Setup never deletes an account and never uninstalls an app.
 * 2. Nothing is paused while the parent still has an account to remove or another user is on
 *    the phone, and the keyboard, home, phone and SMS apps and Android itself are never paused.
 * 3. Device owner is only attempted right after a list in which Android counts nothing.
 * 4. Every app setup paused is back on at the end, unless every attempt failed; then the
 *    parent's last report names it.
 * 5. Wireless debugging is turned off at the end of every run that paired.
 * 6. The "what was on the phone" list keeps everything: an earlier run's accounts and the first list.
 * 7. Nothing is paused after a failure is reported, and "done" means device owner.
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
        /**
         * Every app that declares each account type, in the order Android picks them: pausing one
         * hands the type to the next (the SM-A045F: Play services, then the Google app; Facebook,
         * then com.facebook.services).
         */
        val ownerOf = mapOf(
            "com.google" to listOf(gms, "com.google.android.googlequicksearchbox", "com.android.vending").take(rnd.nextInt(1, 4)),
            "com.osp.app.signin" to listOf(osp), "com.whatsapp" to listOf("com.whatsapp"),
            "www.instagram.com" to listOf("com.instagram.android"),
            "com.facebook.auth.login" to listOf("com.facebook.katana", "com.facebook.services").take(rnd.nextInt(1, 3)),
            "com.android.system.thing" to listOf("android"),
        )
        val accounts = mutableListOf<Account>()
        /** Samsung's account app on some phones won't be turned off. */
        val refusesPause = if (rnd.nextBoolean()) setOf(osp) else emptySet()
        /** The keyboard, home, phone or SMS app in use: sometimes one that holds an account. */
        val keepRunning = if (rnd.nextDouble() < 0.15) setOf("com.whatsapp") else emptySet()
        var otherUsers = if (rnd.nextDouble() < 0.1) 1 else 0
        /** Like the SM-A045F: set-device-owner counts every stored account, paused app or not. */
        val countsStoredAccounts = rnd.nextDouble() < 0.3
        /** What the console last asked the parent to remove. */
        var askedToRemove = emptySet<Account>()
        val disabled = mutableSetOf<String>()
        val everPaused = mutableSetOf<String>()
        val resumeFailures = mutableMapOf<String, Int>()
        val removedByParent = mutableSetOf<Account>()
        var deviceOwner = false
        var recreated = 0
        var paired = false
        var adbOffCalls = 0
        var lastListCountedNothing = false
        var failedReported = false
        var parentGone = false
        var calls = 0
        val firstSeen = mutableListOf<Account>()
        var listed = false

        init {
            repeat(rnd.nextInt(0, 3)) { accounts += Account("com.google", "kid$it@gmail.com") }
            if (rnd.nextBoolean()) accounts += Account("com.osp.app.signin", "kid@samsung")
            listOf("com.whatsapp", "www.instagram.com", "com.facebook.auth.login").forEach { type ->
                if (rnd.nextDouble() < 0.5) accounts += Account(type, type.substringAfterLast('.'))
            }
            if (rnd.nextDouble() < 0.15) accounts += Account("com.gone.app", "orphan") // no app at all
            if (rnd.nextDouble() < 0.05) accounts += Account("com.android.system.thing", "system")
        }

        private fun flaky(name: String, p: Double) {
            calls++
            if (calls > 600) throw Stop()
            log += name
            if (rnd.nextDouble() < p) error("$name: simulated failure")
        }

        private fun registered(type: String): String? = ownerOf[type]?.firstOrNull { it !in disabled }

        /** What Android counts for set-device-owner. */
        private fun counted() = accounts.filter { registered(it.type) != null }

        /** Accounts only the parent can remove: their app can't be paused. */
        private fun parentMustRemove() = counted().filter { a ->
            val owner = registered(a.type)!!
            owner in keepRunning || owner in SetupFlow.NEVER_PAUSE || owner in refusesPause
        }

        private fun parentActs() {
            if (parentGone) return
            if (rnd.nextDouble() < 0.01) { parentGone = true; return }
            (parentMustRemove() + askedToRemove.filter { it in accounts }).firstOrNull()?.takeIf { rnd.nextDouble() < 0.5 }?.let {
                accounts -= it; removedByParent += it
            }
            if (otherUsers > 0 && rnd.nextDouble() < 0.3) otherUsers = 0
            if (rnd.nextDouble() < 0.02) accounts += Account("com.google", "surprise${rnd.nextInt(100)}@gmail.com")
        }

        override suspend fun pairAndConnect() { flaky("pair", 0.05); paired = true }

        override suspend fun listAccounts(): SetupFlow.Event.Accounts {
            flaky("list", 0.03)
            parentActs()
            val now = accounts.toList()
            if (!listed) { firstSeen += now; listed = true }
            lastListCountedNothing = counted().isEmpty() && otherUsers == 0
            // Like `dumpsys account`: every registered authenticator, with or without accounts.
            val owners = ownerOf.keys.mapNotNull { type -> registered(type)?.let { type to it } }.toMap()
            return SetupFlow.Event.Accounts(now, owners, keepRunning, otherUsers)
        }

        override suspend fun pauseApps(packages: List<String>): List<String> {
            calls++
            log += "pause $packages"
            if (failedReported) violations += "paused $packages after a failure was reported"
            if (otherUsers > 0) violations += "paused $packages while another user was on the phone"
            packages.filter { it in keepRunning || it in SetupFlow.NEVER_PAUSE }.takeIf { it.isNotEmpty() }?.let {
                violations += "paused $it, which must keep running"
            }
            val refused = mutableListOf<String>()
            for (pkg in packages) {
                if (rnd.nextDouble() < 0.03) error("pause $pkg: simulated failure")
                if (pkg in refusesPause) refused += pkg else { disabled += pkg; everPaused += pkg }
            }
            return refused
        }

        override suspend fun setDeviceOwner(): String {
            flaky("owner", 0.0)
            if (failedReported) violations += "device owner tried after a failure was reported"
            if (!lastListCountedNothing) violations += "device owner tried while the last list still counted ${counted()}"
            // Facebook, when running, re-created its removed account 2 s after the recount (SM-A045F).
            if ("com.facebook.katana" !in disabled && rnd.nextDouble() < 0.7) {
                removedByParent.firstOrNull { it.type == "com.facebook.auth.login" && it !in accounts }?.let { accounts += it; recreated++ }
            }
            return when {
                // A real account, or Android's stale count; Android 14+ words its live check differently.
                counted().isNotEmpty() || (countsStoredAccounts && accounts.isNotEmpty()) || rnd.nextDouble() < 0.15 -> if (rnd.nextBoolean()) {
                    "java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device."
                } else {
                    "java.lang.RuntimeException: Can't set package ComponentInfo{com.manara.agent/com.manara.agent.OwnerReceiver} as device owner."
                }
                otherUsers > 0 -> "java.lang.IllegalStateException: Not allowed to set the device owner because there are already several users on the device."
                rnd.nextDouble() < 0.02 -> "java.lang.IllegalStateException: something unexpected"
                else -> { deviceOwner = true; "Success: Device owner set to package com.manara.agent/.OwnerReceiver" }
            }
        }

        /** Same contract as AdbSetupDevice: every app is tried, failures thrown at the end. */
        override suspend fun resumeApps(packages: List<String>) {
            calls++
            log += "resume $packages"
            val failed = packages.filter { pkg ->
                if (rnd.nextDouble() < 0.05) { resumeFailures.merge(pkg, 1, Int::plus); true } else { disabled -= pkg; false }
            }
            if (failed.isNotEmpty()) error("resume $failed: simulated failure")
        }

        override suspend fun turnOffWirelessDebugging() { adbOffCalls++; flaky("adb off", 0.05) }

        /** As device owner, Manara sees every account whose app is registered. */
        override suspend fun watchAccounts(): List<Account>? {
            flaky("watch", 0.03)
            if (!parentGone && rnd.nextDouble() < 0.15) return null // the parent chose Finish
            if (!parentGone && rnd.nextDouble() < 0.4) removedByParent.randomOrNull(rnd)?.let { if (it !in accounts) accounts += it }
            return counted()
        }
    }

    @Test
    fun `setup holds its rules on thousands of misbehaving phones and parents`() {
        var leftOff = 0
        var finished = 0
        var failedRuns = 0
        var paused = 0
        var recreated = 0
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
                        if (r.status == SetupFlow.Status.WAITING_FOR_PARENT && r.accounts != null) sim.askedToRemove = r.accounts.toSet()
                        reports += r
                    }, pollMillis = 0, earlierAccounts = earlier, log = { _, _ -> }).run()
                }
            } catch (stop: Stop) {
                null // the parent left mid-way: only the rules checked along the way apply
            } catch (other: Throwable) {
                fail("seed $seed: run() threw $other\n${sim.log.joinToString("\n")}"); return
            }
            if (sim.everPaused.isNotEmpty()) paused++
            recreated += sim.recreated

            // Rule 1: the only accounts gone are those the parent removed.
            val lost = sim.firstSeen.filter { it !in sim.accounts && it !in sim.removedByParent }
            if (lost.isNotEmpty()) sim.violations += "accounts deleted by setup: $lost"

            if (state != null) {
                if (state.step == SetupFlow.Step.DONE) finished++ else failedRuns++
                if (sim.paired && sim.adbOffCalls == 0) sim.violations += "wireless debugging never turned off"
                sim.disabled.forEach { pkg ->
                    // Left off only if every try failed, and then the parent is told which.
                    if ((sim.resumeFailures[pkg] ?: 0) >= SetupRunner.ATTEMPTS && reports.last().message.contains(pkg)) leftOff++
                    else sim.violations += "$pkg was left off (resume failures: ${sim.resumeFailures[pkg] ?: 0}; last report: ${reports.last().message})"
                }
                val initial = state.initialAccounts
                if (initial != null && !initial.containsAll(earlier + sim.firstSeen)) {
                    sim.violations += "what-was-on-the-phone list $initial lost some of ${earlier + sim.firstSeen}"
                }
            }
            if (sim.violations.isNotEmpty()) {
                fail("seed $seed: ${sim.violations.distinct().joinToString("; ")}\n--- calls:\n${sim.log.joinToString("\n")}\n--- reports:\n${reports.joinToString("\n") { "${it.step} ${it.status} ${it.message}" }}")
            }
        }
        println("chaos: $finished finished, $failedRuns failed safely, $paused paused apps, $recreated account(s) re-created by their app, $leftOff app(s) left off after every attempt failed (named to the parent)")
    }
}
