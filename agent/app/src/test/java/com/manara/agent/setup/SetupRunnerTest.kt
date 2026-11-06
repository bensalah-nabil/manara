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

    private class FakeDevice(
        val accountLists: ArrayDeque<List<Account>>,
        val owners: Map<String, String>,
        var userApps: Set<String>,
        val ownerOutput: String,
        val watched: ArrayDeque<List<Account>?> = ArrayDeque(),
        val failOn: String? = null,
    ) : SetupDevice {
        val calls = mutableListOf<String>()

        private fun call(name: String) {
            calls += name
            if (name == failOn) error("$name broke")
        }

        override suspend fun pairAndConnect() = call("pair")
        override suspend fun listAccounts(): SetupFlow.Event.Accounts {
            call("list")
            return SetupFlow.Event.Accounts(accountLists.removeFirst(), owners, userApps)
        }
        override suspend fun backUpAndUninstall(packages: List<String>) { call("remove $packages"); userApps = userApps - packages.toSet() }
        override suspend fun setDeviceOwner(): String { call("owner"); return ownerOutput }
        override suspend fun restoreApps(packages: List<String>) = call("restore $packages")
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
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(listOf(google, whatsapp), listOf(google), emptyList())),
            owners = owners, userApps = setOf("com.whatsapp"), ownerOutput = ownerOk,
            watched = ArrayDeque(listOf(listOf(google), listOf(google, whatsapp))),
        )
        val (state, reports) = run(device)
        assertEquals(
            listOf("pair", "list", "remove [com.whatsapp]", "list", "list", "owner", "restore [com.whatsapp]", "adb off", "watch", "watch"),
            device.calls,
        )
        assertEquals(SetupFlow.Step.DONE, state.step)
        assertEquals(SetupFlow.Status.DONE, reports.last().status)
        assertEquals("no report is sent twice in a row", reports.size, reports.zipWithNext().count { (a, b) -> a != b } + 1)
    }

    @Test
    fun `a failing action is reported and removed apps are put back before stopping`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(listOf(whatsapp), emptyList())),
            owners = owners, userApps = setOf("com.whatsapp"), ownerOutput = ownerOk, failOn = "owner",
        )
        val (state, reports) = run(device)
        assertEquals(listOf("pair", "list", "remove [com.whatsapp]", "list", "owner", "restore [com.whatsapp]", "adb off"), device.calls)
        assertEquals(SetupFlow.Status.FAILED, reports.last().status)
        assertEquals("owner broke", reports.last().message)
        assertEquals("owner broke", state.failure)
    }

    @Test
    fun `recovery still turns wireless debugging off when putting apps back fails`() {
        val device = object : SetupDevice by FakeDevice(ArrayDeque(), owners, emptySet(), ownerOk) {
            val calls = mutableListOf<String>()
            override suspend fun pairAndConnect() { calls += "pair" }
            override suspend fun listAccounts() = error("cannot list")
            override suspend fun restoreApps(packages: List<String>) = error("cannot restore")
            override suspend fun turnOffWirelessDebugging() { calls += "adb off" }
        }
        val reports = mutableListOf<SetupFlow.Report>()
        runBlocking { SetupRunner(device, report = { reports += it }, pollMillis = 0, log = { _, _ -> }).run() }
        assertEquals(listOf("pair", "adb off"), device.calls)
        assertTrue(reports.last().message.contains("cannot list"))
    }

    @Test
    fun `the parent finishing the reconnect step ends setup`() {
        val device = FakeDevice(
            accountLists = ArrayDeque(listOf(listOf(google), emptyList())),
            owners = owners, userApps = emptySet(), ownerOutput = ownerOk,
            watched = ArrayDeque(listOf(emptyList(), null)),
        )
        val (state, reports) = run(device)
        assertEquals(SetupFlow.Step.DONE, state.step)
        assertEquals(null, reports.last().accounts)
    }
}
