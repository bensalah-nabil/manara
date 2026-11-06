package com.manara.agent.setup

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.flyfishxu.kadb.Kadb
import com.flyfishxu.kadb.cert.KadbCert
import com.flyfishxu.kadb.cert.KadbCertPolicy
import com.flyfishxu.kadb.cert.OkioFilePrivateKeyStore
import kotlinx.coroutines.runBlocking
import okio.Path.Companion.toPath
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Opt-in proof for guided setup: can Manara pair with its own phone's wireless debugging and run
 * shell commands? Runs only read-only commands, then deletes its key. Skipped unless pairCode,
 * pairPort and connectPort are passed as instrumentation arguments.
 */
@RunWith(AndroidJUnit4::class)
class SelfAdbProbeTest {
    @Test
    fun pairsWithItsOwnPhoneAndRunsReadOnlyCommands() {
        val args = InstrumentationRegistry.getArguments()
        val code = args.getString("pairCode")
        assumeTrue("opt-in: pass pairCode, pairPort and connectPort", code != null)
        val host = args.getString("host") ?: "127.0.0.1"
        val pairPort = args.getString("pairPort")!!.toInt()
        val connectPort = args.getString("connectPort")!!.toInt()

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val keyDir = File(context.noBackupFilesDir, "self-adb-probe")
        keyDir.mkdirs()
        KadbCert.configure(
            store = OkioFilePrivateKeyStore(privateKeyPath = File(keyDir, "private_key.pem").path.toPath()),
            policy = KadbCertPolicy(),
            additionalPrivateKeysPem = emptyList()
        )
        val report = Bundle()
        try {
            runBlocking { Kadb.pair(host, pairPort, code!!) }
            Kadb.create(host, connectPort).use { kadb ->
                val id = kadb.shell("id").output.trim()
                report.putString("id", id)
                report.putString("accounts", kadb.shell("dumpsys account | grep -c 'Account {'").output.trim())
                report.putString("owners", kadb.shell("dpm list-owners").output.trim().replace('\n', ' '))
                report.putString("sdk", kadb.shell("getprop ro.build.version.sdk").output.trim())
                assertTrue("expected the adb shell user, got: $id", id.startsWith("uid=2000(shell)"))
            }
        } finally {
            InstrumentationRegistry.getInstrumentation().sendStatus(0, report)
            KadbCert.clear()
            keyDir.deleteRecursively()
        }
    }
}
