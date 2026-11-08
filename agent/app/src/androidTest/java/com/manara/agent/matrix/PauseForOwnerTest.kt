package com.manara.agent.matrix

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.manara.agent.setup.AccountDump
import com.manara.agent.setup.AccountRecount
import com.manara.agent.setup.SetupFlow
import com.manara.agent.setup.SetupInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Guided setup's way to device owner, on a real Android build, with the commands setup sends:
 * an app holding an account is paused, Manara makes Android recount, set-device-owner succeeds,
 * the app is turned back on, and its account and data are still there.
 *
 * Needs tools/account-fixture installed. Emulator only (or `throwawayDevice=true`): it makes the
 * phone managed and releases it, so on a real phone, or one Manara already manages, it skips.
 */
@RunWith(AndroidJUnit4::class)
class PauseForOwnerTest {

    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val dpm: DevicePolicyManager get() = context.getSystemService(DevicePolicyManager::class.java)

    private fun shell(command: String): String {
        val pfd = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
        return android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().use { it.readText() }
    }

    private fun fixtureAccounts(): List<AccountDump.Account> =
        AccountDump.parse(shell("dumpsys account")).first { it.userId == 0 }.accounts.filter { it.type == FIXTURE_TYPE }

    private fun isEmulator(): Boolean =
        Build.HARDWARE in setOf("ranchu", "goldfish") || Build.FINGERPRINT.startsWith("generic") || Build.PRODUCT.contains("sdk")

    @Test
    fun aPausedAppNoLongerBlocksDeviceOwnerAndComesBackWithItsAccountAndData() {
        val throwaway = InstrumentationRegistry.getArguments().getString("throwawayDevice") == "true"
        assumeTrue("emulator or throwaway device only", isEmulator() || throwaway)
        assumeTrue("already managed: not a test device", !dpm.isDeviceOwnerApp(context.packageName))
        assumeTrue("tools/account-fixture is not installed", SetupInput.packageLines(shell("pm path $FIXTURE")).isNotEmpty())

        shell("am start -W -n $FIXTURE/.AddActivity")
        val before = fixtureAccounts()
        assertEquals("the fixture's account is on the phone", 1, before.size)

        val owners = AccountDump.parse(shell("dumpsys account")).first { it.userId == 0 }.owners
        assertEquals("dumpsys names the fixture as the type's app", FIXTURE, owners[FIXTURE_TYPE])

        // The keyboard and role holders setup never pauses are readable with these exact commands.
        if (Build.VERSION.SDK_INT >= 29) {
            assertTrue("home role", SetupInput.roleHolders(shell("cmd role get-role-holders --user 0 android.app.role.HOME")).isNotEmpty())
        }

        val disabled = shell("pm disable-user --user 0 $FIXTURE")
        assertTrue(disabled, SetupInput.pmNewState(disabled, FIXTURE, "disabled-user"))
        var owner = ""
        try {
            assertTrue("Manara's recount account was added and removed", AccountRecount.trigger(context))
            SystemClock.sleep(1_500)
            owner = shell("dpm set-device-owner ${context.packageName}/.OwnerReceiver")
            assertTrue("set-device-owner with a paused app's account on the phone: $owner", SetupFlow.deviceOwnerSucceeded(owner))
            assertEquals("the account is kept while the app is off", before, fixtureAccounts())
        } finally {
            val enabled = shell("pm enable $FIXTURE")
            assertTrue(enabled, SetupInput.pmNewState(enabled, FIXTURE, "enabled"))
            if (dpm.isDeviceOwnerApp(context.packageName)) {
                @Suppress("DEPRECATION")
                dpm.clearDeviceOwnerApp(context.packageName)
            }
        }
        assertEquals("the account is back", before, fixtureAccounts())
        assertEquals("the app's data is untouched", "app data kept", shell("run-as $FIXTURE cat files/marker.txt").trim())
    }

    private companion object {
        const val FIXTURE = "com.manara.fixture"
        const val FIXTURE_TYPE = "com.manara.fixture"
    }
}
