package com.manara.agent.setup

import com.manara.agent.setup.AccountDump.Account
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SetupRunnerTest {

    private val whatsapp = Account("com.whatsapp", "WhatsApp")
    private val google = Account("com.google", "kid@gmail.com")
    private val owners = mapOf("com.whatsapp" to "com.whatsapp", "com.google" to "com.google.android.gms")
    private val ownerOk = "Success: Device owner set to package com.manara.agent/.OwnerReceiver\n"

    /** A paused app's account stays listed, but its type loses its owner, as on the emulator. */
    private class FakeDevice(
        val accountLists: ArrayDeque<List<Account>>,
        val owners: Map<String, String>,
        val ownerOutput: String,
        val watched: ArrayDeque<List<Account>?> = ArrayDeque(),
        val failOn: String? = null,
        val keepRunning: Set<String> = emptySet(),
    ) : SetupDevice {
        val calls = mutableListOf<String>()
        val paused = mutableSetOf<String>()

        private fun call(name: String) {
            calls += name
            if (name == failOn) error("$name broke")
        }

        override suspend fun pairAndConnect() = call("pair")
        override suspend fun listAccounts(): SetupFlow.Event.Accounts {
            call("list")
            return SetupFlow.Event.Accounts(accountLists.removeFirst(), owners.filterValues { it !in paused }, keepRunning)
        }
        override suspend fun pauseApps(packages: List<String>): List<String> { call("pause $packages"); paused += packages; return emptyList() }
        override suspend fun setDeviceOwner(): String { call("owner"); return ownerOutput }
        override suspend fun resumeApps(packages: List<String>) { call("resume $packages"); paused -= packages.toSet() }
        override suspend fun turnOffWirelessDebugging() = call("adb off")
        override suspend fun watchAccounts(): List<Account>? { call("watch"); return watched.removeFirst() }
    }

    private fun run(device: FakeDevice): Pair<SetupFlow.State, List<SetupFlow.Report>> {
        val reports = mutableListOf<SetupFlow.Report>()
        val state = runBlocking { SetupRunner(device, report = { reports += it }, pollMillis = 0, log = { _, _ -> }).run() }
        return state to reports
    }

    @Test
    fun `runs the fixed actions in order and reports each step once`() {
        val both = listOf(google, whatsapp)
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(both, both, both)),
            owners = owners, ownerOutput = ownerOk,
            watched = ArrayDeque(listOf(both)),
        )
        val (state, reports) = run(device)
        assertEquals(
            listOf("pair", "list", "list", "pause [com.google.android.gms, com.whatsapp]", "list", "owner",
                "resume [com.google.android.gms, com.whatsapp]", "adb off", "watch"),
            device.calls,
        )
        assertEquals(SetupFlow.Step.DONE, state.step)
        assertEquals(SetupFlow.Status.DONE, reports.last().status)
        assertEquals("no report is sent twice in a row", reports.size, reports.zipWithNext().count { (a, b) -> a != b } + 1)
    }

    @Test
    fun `a failing action is reported and paused apps are turned back on before stopping`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(listOf(whatsapp), listOf(whatsapp), listOf(whatsapp))),
            owners = owners, ownerOutput = ownerOk, failOn = "owner",
        )
        val (state, reports) = run(device)
        assertEquals(listOf("pair", "list", "list", "pause [com.whatsapp]", "list", "owner", "resume [com.whatsapp]", "adb off"), device.calls)
        assertEquals(SetupFlow.Status.FAILED, reports.last().status)
        assertEquals("owner broke", reports.last().message)
        assertEquals("owner broke", state.failure)
    }

    @Test
    fun `recovery still turns wireless debugging off, and names the apps it could not turn back on`() {
        val device = object : SetupDevice by FakeDevice(ArrayDeque(), owners, ownerOk) {
            val calls = mutableListOf<String>()
            var lists = 0
            override suspend fun pairAndConnect() { calls += "pair" }
            override suspend fun listAccounts(): SetupFlow.Event.Accounts {
                if (++lists > 2) error("cannot list")
                return SetupFlow.Event.Accounts(listOf(whatsapp), owners)
            }
            override suspend fun pauseApps(packages: List<String>): List<String> { calls += "pause"; return emptyList() }
            override suspend fun resumeApps(packages: List<String>) = error("cannot resume")
            override suspend fun turnOffWirelessDebugging() { calls += "adb off" }
        }
        val reports = mutableListOf<SetupFlow.Report>()
        runBlocking { SetupRunner(device, report = { reports += it }, pollMillis = 0, log = { _, _ -> }).run() }
        assertEquals(listOf("pair", "pause", "adb off"), device.calls)
        assertTrue(reports.last().message.contains("cannot list"))
        assertTrue(reports.last().message.contains("Settings, Apps: com.whatsapp"))
    }

    @Test
    fun `the parent finishing the reconnect step ends setup`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(listOf(google), listOf(google), emptyList())),
            owners = owners, ownerOutput = ownerOk, keepRunning = setOf("com.google.android.gms"),
            watched = ArrayDeque(listOf(emptyList(), null)),
        )
        val (state, reports) = run(device)
        assertEquals(SetupFlow.Step.DONE, state.step)
        assertEquals(null, reports.last().accounts)
    }

    @Test
    fun `a run resumed after a restart only watches, and the saved step is kept until it ends`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(), owners = owners, ownerOutput = ownerOk,
            watched = ArrayDeque(listOf(emptyList(), listOf(google))),
        )
        val kept = mutableListOf<List<Account>?>()
        val state = runBlocking {
            SetupRunner(
                device, report = {}, pollMillis = 0, log = { _, _ -> },
                startAt = SetupFlow.resumeReconnecting(listOf(google)),
                onState = { kept += ReconnectMarker.toKeep(it) },
            ).run()
        }
        assertEquals(SetupFlow.Step.DONE, state.step)
        assertEquals("no adb, no pausing, no device owner", listOf("watch", "watch"), device.calls)
        assertEquals(listOf(google), kept.first())
        assertEquals("forgotten once done", null, kept.last())
    }

    @Test
    fun `an unchanged report is sent again once a heartbeat has passed, not on every check`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(), owners = owners, ownerOutput = ownerOk,
            watched = ArrayDeque(List<List<Account>?>(7) { emptyList() } + listOf(null)),
        )
        var now = 0L
        val reports = mutableListOf<SetupFlow.Report>()
        runBlocking {
            SetupRunner(
                device, report = { reports += it }, pollMillis = 0, log = { _, _ -> },
                startAt = SetupFlow.resumeReconnecting(listOf(google)), heartbeatMillis = 60_000,
                clock = { now.also { now += 20_000 } }, // every reading of the clock is 20 s later
            ).run()
        }
        // Seven identical checks 20 s apart: sent at the change, then at 60 s and 120 s.
        assertEquals(3, reports.count { it.status == SetupFlow.Status.WAITING_FOR_PARENT })
        assertEquals(SetupFlow.Status.DONE, reports.last().status)
    }
}
