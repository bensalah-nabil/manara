package com.manara.agent.setup

import android.accounts.AccountManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.SystemClock
import com.flyfishxu.kadb.Kadb
import com.flyfishxu.kadb.cert.KadbCert
import com.flyfishxu.kadb.cert.KadbCertPolicy
import com.flyfishxu.kadb.cert.OkioFilePrivateKeyStore
import com.manara.agent.setup.AccountDump.Account
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import okio.Path.Companion.toPath
import java.io.File
import java.net.Inet4Address
import java.net.InetAddress
import kotlin.coroutines.resume

/**
 * Runs guided setup's fixed commands through this phone's own wireless debugging (Kadb).
 * Nothing here takes a command from outside: every shell line is built from constants plus
 * package names and APK paths that pass [SetupInput]'s checks.
 */
class AdbSetupDevice(
    private val context: Context,
    private val console: SetupConsole,
) : SetupDevice {

    private val keyDir = File(context.noBackupFilesDir, "setup-adb")
    /** APK copies an earlier version saved before uninstalling an app; put back once, then deleted. */
    private val legacyBackupDir = File(context.noBackupFilesDir, "setup-apks")
    /**
     * Apps this setup turned off and has not yet turned back on, written before each is touched:
     * a run cut off mid-way (the phone restarted, Manara was stopped) turns them on next time.
     */
    private val pausedFile = File(context.noBackupFilesDir, "setup-paused.txt")
    private var kadb: Kadb? = null

    override suspend fun pairAndConnect() = withContext(Dispatchers.IO) {
        val host = wifiAddress() ?: error("The phone is not on Wi-Fi. Connect it to Wi-Fi and start again.")
        keyDir.mkdirs()
        KadbCert.configure(
            store = OkioFilePrivateKeyStore(privateKeyPath = File(keyDir, "private_key.pem").path.toPath()),
            policy = KadbCertPolicy(),
            additionalPrivateKeysPem = emptyList(),
        )
        pair(host)
        val port = withTimeout(CONNECT_DISCOVERY_MILLIS) { servicePort(CONNECT_SERVICE, host) }
        kadb = Kadb.create(host.hostAddress!!, port)
        val id = shell("id")
        check(id.startsWith("uid=2000(shell)")) { "Connected, but not as the adb shell user." }
        putBackLeftovers()
    }

    /** Best effort: what an earlier, cut-off run left off or uninstalled comes back before anything else. */
    private fun putBackLeftovers() {
        val paused = readPaused()
        if (paused.isNotEmpty()) {
            runCatching { resumeNow(paused) }.onFailure { android.util.Log.w(TAG, "could not turn back on $paused", it) }
        }
        val saved = legacyBackupDir.listFiles { file -> file.isDirectory }.orEmpty()
        for (dir in saved) {
            runCatching {
                val pkg = dir.name
                requireSafePackage(pkg)
                if (!installed(pkg)) {
                    val files = dir.listFiles { file -> file.name.endsWith(".apk") }.orEmpty().sortedBy { it.name }
                    check(files.isNotEmpty()) { "No saved copy of $pkg." }
                    if (files.size == 1) connection().install(files[0]) else connection().installMultiple(files)
                    check(installed(pkg)) { "$pkg did not come back." }
                }
                dir.deleteRecursively()
            }.onFailure { android.util.Log.w(TAG, "could not put back ${dir.name}", it) }
        }
    }

    /**
     * Waits until the parent pairs from the console (ADR-0005): the phone scans the console's QR
     * code, or shows a pairing code the parent types there. The phone never leaves its Wireless
     * debugging screen, which stops pairing the moment it pauses (AOSP WirelessDebuggingFragment).
     */
    private suspend fun pair(host: InetAddress) {
        val qr = console.qr
        var lastSeq = console.input()?.pairingCodeSeq ?: 0
        val triedQrPorts = mutableSetOf<Int>()
        var failures = 0
        while (true) {
            val services = pairingServices(host)
            val input = console.input()
            val code = input?.let { PairingDecision.newCode(it.pairingCode, it.pairingCodeSeq, lastSeq) }
            when (val next = PairingDecision.next(services, qr.name, code, triedQrPorts)) {
                is PairingDecision.Next.PairWithQr -> {
                    triedQrPorts += next.port
                    console.pairingStatus("The phone scanned the QR code. Pairing...")
                    if (tryPair(host, next.port, qr.password)) return
                    failures++
                    console.pairingStatus("Pairing with the QR code didn't work. On the phone, tap Pair device with QR code and scan it again.")
                }
                is PairingDecision.Next.PairWithCode -> {
                    lastSeq = next.code.seq
                    console.pairingStatus("Pairing with the code from the console...")
                    if (tryPair(host, next.port, next.code.code)) return
                    failures++
                    console.pairingStatus("That code didn't work. On the phone, tap Pair device with pairing code again and send the new code.")
                }
                is PairingDecision.Next.NoCodeScreen -> {
                    lastSeq = next.code.seq
                    console.pairingStatus("The code arrived, but the phone isn't showing its pairing code. Tap Pair device with pairing code, keep it open, and send its code.")
                }
                PairingDecision.Next.Wait -> Unit
            }
            if (failures >= SetupInput.PAIRING_ATTEMPTS) {
                error("Pairing didn't work after ${SetupInput.PAIRING_ATTEMPTS} tries. Start guided setup again.")
            }
        }
    }

    private suspend fun tryPair(host: InetAddress, port: Int, password: String): Boolean = try {
        Kadb.pair(host.hostAddress!!, port, password)
        true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        android.util.Log.w(TAG, "pairing failed", error)
        false
    }

    override suspend fun listAccounts(): SetupFlow.Event.Accounts = withContext(Dispatchers.IO) {
        val users = AccountDump.parse(shell("dumpsys account"))
        val main = users.firstOrNull { it.userId == 0 } ?: error("No main user in the account list.")
        SetupFlow.Event.Accounts(main.accounts, main.owners, keepRunning(), otherUsers = users.size - 1)
    }

    /**
     * Apps the phone is using as its keyboard, home screen, phone and SMS app: turning one off,
     * even for seconds, can make Android pick another default. Their accounts go to the parent.
     */
    private fun keepRunning(): Set<String> = buildSet {
        SetupInput.imePackage(connection().shell("settings get secure default_input_method").output)?.let(::add)
        for (role in listOf("android.app.role.HOME", "android.app.role.SMS", "android.app.role.DIALER")) {
            // `cmd role` is Android 10+ (RoleShellCommand); an older phone answers with an error, ignored.
            val response = connection().shell("cmd role get-role-holders --user 0 $role")
            if (response.exitCode == 0) addAll(SetupInput.roleHolders(response.output))
        }
    }

    override suspend fun pauseApps(packages: List<String>): List<String> = withContext(Dispatchers.IO) {
        packages.forEach(::requireSafePackage)
        writePaused(readPaused() + packages)
        val refused = packages.filter { pkg ->
            val output = connection().shell("pm disable-user --user 0 $pkg").allOutput
            !SetupInput.pmNewState(output, pkg, "disabled-user").also { ok ->
                if (!ok) android.util.Log.w(TAG, "could not pause $pkg: ${output.take(200)}")
            }
        }
        writePaused(readPaused() - refused.toSet())
        AccountRecount.trigger(context)
        refused
    }

    override suspend fun setDeviceOwner(): String = withContext(Dispatchers.IO) {
        awaitEarlierAdminRemoved()
        // Android answers from a count it refreshes in the background: refresh it, give it a moment.
        AccountRecount.trigger(context)
        kotlinx.coroutines.delay(RECOUNT_SETTLE_MILLIS)
        connection().shell("dpm set-device-owner ${context.packageName}/.OwnerReceiver").allOutput.also { output ->
            // Only component names and Android's exception text; the reason a try failed is otherwise lost.
            android.util.Log.i(TAG, "set-device-owner: ${output.trim().take(300)}")
            if (isDeviceOwner()) com.manara.agent.ManagedNoticeService.start(context)
        }
    }

    override fun isDeviceOwner(): Boolean =
        context.getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName)

    /**
     * A refused try leaves Manara an admin until Android has finished removing it, and a try before
     * then fails at once ([SetupFlow.adminBeingRemoved]). isAdminActive stays true until that removal
     * completes (AOSP android14-release: the admin leaves mAdminMap in removeAdminArtifacts, last).
     */
    private suspend fun awaitEarlierAdminRemoved() {
        if (isDeviceOwner()) return
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, com.manara.agent.OwnerReceiver::class.java)
        val deadline = SystemClock.elapsedRealtime() + ADMIN_REMOVAL_WAIT_MILLIS
        while (dpm.isAdminActive(admin) && SystemClock.elapsedRealtime() < deadline) kotlinx.coroutines.delay(POLL_MILLIS)
        if (dpm.isAdminActive(admin)) android.util.Log.i(TAG, "still an admin from an earlier try; trying anyway")
    }

    override suspend fun resumeApps(packages: List<String>) = withContext(Dispatchers.IO) { resumeNow(packages) }

    private fun resumeNow(packages: List<String>) {
        val failed = packages.filter { pkg ->
            runCatching {
                requireSafePackage(pkg)
                val output = connection().shell("pm enable $pkg").allOutput
                check(SetupInput.pmNewState(output, pkg, "enabled")) { output.take(200) }
            }.onFailure { android.util.Log.w(TAG, "could not turn $pkg back on", it) }.isFailure
        }
        writePaused(readPaused() - (packages.toSet() - failed.toSet()))
        check(failed.isEmpty()) { "Could not turn back on: ${failed.joinToString()}." }
    }

    private fun readPaused(): List<String> =
        if (pausedFile.exists()) pausedFile.readLines().map { it.trim() }.filter(SetupInput::isSafePackageName).distinct() else emptyList()

    private fun writePaused(packages: List<String>) {
        val list = packages.distinct()
        if (list.isEmpty()) pausedFile.delete() else pausedFile.writeText(list.joinToString("\n"))
    }

    /** `pm path` exits non-zero for a package that isn't installed, so it isn't run through [shell]. */
    private fun installed(pkg: String): Boolean =
        SetupInput.packageLines(connection().shell("pm path $pkg").output).isNotEmpty()

    override suspend fun turnOffWirelessDebugging(): Unit = withContext(Dispatchers.IO) {
        try {
            // Turning it off drops this very connection, so a missing reply is expected.
            runCatching { connection().shell("settings put global adb_wifi_enabled 0") }
                .onFailure { android.util.Log.i(TAG, "connection closed while turning wireless debugging off", it) }
        } finally {
            runCatching { kadb?.close() }.onFailure { android.util.Log.w(TAG, "close failed", it) }
            kadb = null
            KadbCert.clear()
            keyDir.deleteRecursively()
        }
    }

    override suspend fun watchAccounts(): List<Account>? {
        // The parent signs back in to the accounts they want, then chooses Finish setup in the console.
        if (console.input()?.finish == true) return null
        // A device owner sees every account (AccountManagerService.resolveAccountVisibility).
        return AccountManager.get(context).accounts.map { Account(it.type, it.name) }
    }

    private fun connection(): Kadb = kadb ?: error("Not connected to wireless debugging.")

    private fun shell(command: String): String {
        val response = connection().shell(command)
        check(response.exitCode == 0) { "`${command.substringBefore(' ')}` failed: ${response.allOutput.take(120)}" }
        return response.output
    }

    private fun requireSafePackage(pkg: String) = require(SetupInput.isSafePackageName(pkg)) { "Unexpected package name." }

    private fun wifiAddress(): Inet4Address? {
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val properties = connectivity.getLinkProperties(connectivity.activeNetwork) ?: return null
        return properties.linkAddresses.map { it.address }.filterIsInstance<Inet4Address>().firstOrNull { !it.isLoopbackAddress }
    }

    /** The pairing services open on this phone's own address, by name, over one discovery window. */
    private suspend fun pairingServices(host: InetAddress): List<PairingDecision.Service> {
        val nsd = context.getSystemService(NsdManager::class.java)
        return discover(nsd, PAIRING_SERVICE).mapNotNull { service ->
            val resolved = resolve(nsd, service) ?: return@mapNotNull null
            @Suppress("DEPRECATION")
            if (resolved.host == host) PairingDecision.Service(resolved.serviceName, resolved.port) else null
        }.also { services ->
            if (services.isNotEmpty()) android.util.Log.i(TAG, "pairing services: ${services.joinToString { "${it.name}:${it.port}" }}")
        }
    }

    /**
     * Finds the port of this phone's own wireless-debugging service of [type]: `_adb-tls-connect._tcp`
     * (developer.android.com/tools/adb), or `_adb-tls-pairing._tcp` while the pairing dialog is open
     * (`ADB_MDNS_TLS_PAIRING_TYPE` in AOSP's adb_mdns.h).
     */
    private suspend fun servicePort(type: String, host: InetAddress): Int {
        val nsd = context.getSystemService(NsdManager::class.java)
        while (true) {
            for (service in discover(nsd, type)) {
                val resolved = resolve(nsd, service) ?: continue
                @Suppress("DEPRECATION")
                if (resolved.host == host) return resolved.port
            }
        }
    }

    private suspend fun discover(nsd: NsdManager, type: String): List<NsdServiceInfo> = suspendCancellableCoroutine { continuation ->
        val found = mutableListOf<NsdServiceInfo>()
        val listener = object : NsdManager.DiscoveryListener {
            override fun onServiceFound(service: NsdServiceInfo) { synchronized(found) { found += service } }
            // A pairing dialog closed during the window: resolving its service would never answer.
            override fun onServiceLost(service: NsdServiceInfo) { synchronized(found) { found.removeAll { it.serviceName == service.serviceName } } }
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) {
                if (continuation.isActive) continuation.resume(synchronized(found) { found.toList() })
            }
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                if (continuation.isActive) continuation.resume(emptyList())
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                if (continuation.isActive) continuation.resume(synchronized(found) { found.toList() })
            }
        }
        nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener)
        val stop = Runnable { runCatching { nsd.stopServiceDiscovery(listener) } }
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        handler.postDelayed(stop, DISCOVERY_WINDOW_MILLIS)
        continuation.invokeOnCancellation { handler.removeCallbacks(stop); stop.run() }
    }

    /**
     * Null when the service can't be resolved within [RESOLVE_MILLIS]. Without that bound, a service
     * that vanished (the parent closed the pairing-code dialog to scan the QR code instead) was
     * queried forever on Android 14's mDNS stack, with neither callback, and the pairing loop never
     * saw the QR code's service (SM-A528B, `dumpsys servicediscovery`, 2026-11-08).
     */
    @Suppress("DEPRECATION")
    private suspend fun resolve(nsd: NsdManager, service: NsdServiceInfo): NsdServiceInfo? =
        withTimeoutOrNull(RESOLVE_MILLIS) {
            suspendCancellableCoroutine { continuation ->
                val listener = object : NsdManager.ResolveListener {
                    override fun onServiceResolved(info: NsdServiceInfo) { if (continuation.isActive) continuation.resume(info) }
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) { if (continuation.isActive) continuation.resume(null) }
                }
                nsd.resolveService(service, listener)
                // API 34 (developer.android.com, NsdManager.stopServiceResolution); throws if it already ended.
                if (android.os.Build.VERSION.SDK_INT >= 34) {
                    continuation.invokeOnCancellation { runCatching { nsd.stopServiceResolution(listener) } }
                }
            }
        }.also { if (it == null) android.util.Log.i(TAG, "no answer resolving ${service.serviceName}; skipped") }

    private companion object {
        const val TAG = "ManaraSetup"
        const val CONNECT_SERVICE = "_adb-tls-connect._tcp"
        const val PAIRING_SERVICE = "_adb-tls-pairing._tcp"
        const val DISCOVERY_WINDOW_MILLIS = 3_000L
        const val CONNECT_DISCOVERY_MILLIS = 30_000L
        const val RESOLVE_MILLIS = 3_000L
        /** On the emulator the recount finished within 50 ms; set-device-owner retries if it's slower. */
        const val RECOUNT_SETTLE_MILLIS = 1_500L
        /** The SM-A528B was still removing it 7 s after a refusal; [SetupFlow.MAX_REMOVAL_WAITS] covers longer. */
        const val ADMIN_REMOVAL_WAIT_MILLIS = 20_000L
        const val POLL_MILLIS = 500L
    }
}
