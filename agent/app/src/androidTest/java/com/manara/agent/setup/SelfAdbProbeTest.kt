package com.manara.agent.setup

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.flyfishxu.kadb.cert.KadbCert
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Opt-in check of guided setup's real phone I/O, read-only: pair with this phone's own wireless
 * debugging, find the connect port over mDNS, and read the accounts. Never runs a setup action
 * that changes the phone, and never turns wireless debugging off. Skipped unless `pairing` is
 * passed, e.g. `-e pairing "123456 41235"`. Reports only counts, never account names.
 */
@RunWith(AndroidJUnit4::class)
class SelfAdbProbeTest {
    @Test
    fun pairsFindsTheConnectPortAndReadsAccounts() {
        val args = InstrumentationRegistry.getArguments()
        val pairing = args.getString("pairing")?.let(SetupInput::parsePairing)
        assumeTrue("opt-in: pass -e pairing \"CODE PORT\"", pairing != null)

        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val device = AdbSetupDevice(context, pairingInput = { pairing!! }, parentFinished = { false })
        val report = Bundle()
        try {
            runBlocking {
                device.pairAndConnect()
                report.putString("connected", "yes")
                val accounts = device.listAccounts()
                report.putString("accounts", accounts.accounts.size.toString())
                report.putString("owned", accounts.accounts.count { it.type in accounts.owners }.toString())
                report.putString("userAppAccounts", accounts.accounts.count { accounts.owners[it.type] in accounts.userApps }.toString())
                report.putString("userApps", accounts.userApps.size.toString())
                report.putString("otherUsers", accounts.otherUsers.toString())
            }
        } finally {
            InstrumentationRegistry.getInstrumentation().sendStatus(0, report)
            KadbCert.clear()
            File(context.noBackupFilesDir, "setup-adb").deleteRecursively()
        }
    }
}
