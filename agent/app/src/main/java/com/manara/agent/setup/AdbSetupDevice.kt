package com.manara.agent.setup

import android.accounts.AccountManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
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
    /** Asks for the pairing code; [retry] says why the last one didn't work, null the first time. */
    private val pairingInput: suspend (retry: String?) -> SetupInput.Pairing,
    private val parentFinished: () -> Boolean,
) : SetupDevice {

    private val keyDir = File(context.noBackupFilesDir, "setup-adb")
    private val backupDir = File(context.noBackupFilesDir, "setup-apks")
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
    }

    /** Each "Pair device with pairing code" tap shows a new code, so a failed one is simply asked for again. */
    private suspend fun pair(host: InetAddress) {
        var retry: String? = null
        repeat(SetupInput.PAIRING_ATTEMPTS) {
            val pairing = pairingInput(retry)
            val port = pairing.port ?: withTimeoutOrNull(PAIRING_DISCOVERY_MILLIS) { servicePort(PAIRING_SERVICE, host) }
            if (port == null) {
                retry = "Manara couldn't find the pairing screen. Tap Pair device with pairing code, keep it open, and enter its code."
                return@repeat
            }
            try {
                Kadb.pair(host.hostAddress!!, port, pairing.code)
                return
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                android.util.Log.w(TAG, "pairing failed", error)
                retry = "That code didn't work. Tap Pair device with pairing code again and enter the new code."
            }
        }
        error("Pairing didn't work after ${SetupInput.PAIRING_ATTEMPTS} codes. Start guided setup again.")
    }

    override suspend fun listAccounts(): SetupFlow.Event.Accounts = withContext(Dispatchers.IO) {
        val users = AccountDump.parse(shell("dumpsys account"))
        val main = users.firstOrNull { it.userId == 0 } ?: error("No main user in the account list.")
        val userApps = SetupInput.packageLines(shell("pm list packages -3 --user 0")).toSet() - context.packageName
        SetupFlow.Event.Accounts(main.accounts, main.owners, userApps, otherUsers = users.size - 1)
    }

    override suspend fun backUpAndUninstall(packages: List<String>) = withContext(Dispatchers.IO) {
        for (pkg in packages) {
            requireSafePackage(pkg)
            val paths = SetupInput.packageLines(shell("pm path $pkg"))
            check(paths.isNotEmpty() && paths.all(SetupInput::isSafeApkPath)) { "Cannot find the files of $pkg." }
            val dir = File(backupDir, pkg).apply { deleteRecursively(); mkdirs() }
            paths.forEach { path -> connection().pull(File(dir, File(path).name), path) }
            check(dir.listFiles().orEmpty().size == paths.size) { "Could not save all files of $pkg." }
            val result = shell("pm uninstall $pkg")
            check(SetupInput.pmSucceeded(result)) { "Could not remove $pkg: ${result.take(120)}" }
        }
    }

    override suspend fun setDeviceOwner(): String = withContext(Dispatchers.IO) {
        connection().shell("dpm set-device-owner ${context.packageName}/.OwnerReceiver").allOutput
    }

    override suspend fun restoreApps(packages: List<String>) = withContext(Dispatchers.IO) {
        for (pkg in packages) {
            requireSafePackage(pkg)
            val files = File(backupDir, pkg).listFiles { file -> file.name.endsWith(".apk") }.orEmpty().sortedBy { it.name }
            check(files.isNotEmpty()) { "No saved copy of $pkg to put back." }
            if (files.size == 1) connection().install(files[0]) else connection().installMultiple(files)
            check(SetupInput.packageLines(shell("pm path $pkg")).isNotEmpty()) { "$pkg did not come back." }
            File(backupDir, pkg).deleteRecursively()
        }
    }

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
        if (parentFinished()) return null
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
            override fun onServiceLost(service: NsdServiceInfo) = Unit
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

    @Suppress("DEPRECATION")
    private suspend fun resolve(nsd: NsdManager, service: NsdServiceInfo): NsdServiceInfo? =
        suspendCancellableCoroutine { continuation ->
            nsd.resolveService(service, object : NsdManager.ResolveListener {
                override fun onServiceResolved(info: NsdServiceInfo) { if (continuation.isActive) continuation.resume(info) }
                override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) { if (continuation.isActive) continuation.resume(null) }
            })
        }

    private companion object {
        const val TAG = "ManaraSetup"
        const val CONNECT_SERVICE = "_adb-tls-connect._tcp"
        const val PAIRING_SERVICE = "_adb-tls-pairing._tcp"
        const val PAIRING_DISCOVERY_MILLIS = 15_000L
        const val DISCOVERY_WINDOW_MILLIS = 3_000L
        const val CONNECT_DISCOVERY_MILLIS = 30_000L
    }
}
