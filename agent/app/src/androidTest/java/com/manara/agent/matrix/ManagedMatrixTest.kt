package com.manara.agent.matrix

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.os.UserManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.manara.agent.MainActivity
import com.manara.agent.OwnerReceiver
import com.manara.agent.enforcers.BrowserPolicyDecision
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.policy.Policy
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Calendar

/**
 * The device-owner part of Manara on each Android version, on an emulator (Gradle managed devices,
 * `./gradlew matrixGroupDebugAndroidTest`). The emulator is made device owner through the test's
 * shell rights, the way guided setup does it with adb, then every rule is applied through the real
 * enforcer registry and checked against what Android reports, then lifted.
 *
 * Emulator only: it changes the rules and releases the phone at the end, so on a real phone it
 * skips itself (a child's managed phone must never run this). The one exception is a throwaway
 * device farm phone (Firebase Test Lab wipes it after the run), which must be asked for with the
 * instrumentation argument `throwawayDevice=true` (tools/test-lab/run.sh does).
 */
@RunWith(AndroidJUnit4::class)
class ManagedMatrixTest {

    companion object {
        private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext
        private val dpm: DevicePolicyManager get() = context.getSystemService(DevicePolicyManager::class.java)
        private val admin: ComponentName get() = ComponentName(context, OwnerReceiver::class.java)
        private var madeOwnerHere = false

        private fun isEmulator(): Boolean =
            Build.HARDWARE in setOf("ranchu", "goldfish") || Build.FINGERPRINT.startsWith("generic") ||
                Build.PRODUCT.contains("sdk")

        fun shell(command: String): String {
            val pfd = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
            return android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().use { it.readText() }
        }

        @BeforeClass @JvmStatic
        fun becomeDeviceOwner() {
            val throwaway = InstrumentationRegistry.getArguments().getString("throwawayDevice") == "true"
            assumeTrue("emulator or throwaway device only: this test changes the phone's rules and releases it", isEmulator() || throwaway)
            // A phone Manara already manages is someone's: never touch it.
            assumeTrue("already managed: not a test device", !dpm.isDeviceOwnerApp(context.packageName))
            val out = shell("dpm set-device-owner ${context.packageName}/.OwnerReceiver")
            madeOwnerHere = dpm.isDeviceOwnerApp(context.packageName)
            if (throwaway && !isEmulator()) {
                // A farm phone signed in to an account can't become device owner; that is a finding, not a failure.
                assumeTrue("this farm phone refused device owner: ${out.trim()}", madeOwnerHere)
            }
            assertTrue("set-device-owner on a clean emulator: $out", madeOwnerHere)
        }

        @AfterClass @JvmStatic
        fun release() {
            if (!madeOwnerHere) return
            defaultEnforcerRegistry(context).applyAll(Policy(version = 0))
            @Suppress("DEPRECATION")
            dpm.clearDeviceOwnerApp(context.packageName)
            shell("input keyevent KEYCODE_WAKEUP")
        }
    }

    private val allRestrictions = Policy.Restrictions(
        blockVpnConfig = true, blockPrivateDnsConfig = true, blockFactoryReset = true,
        blockSafeBoot = true, blockAddUser = true, blockDateTime = true,
    )

    @Test
    fun settingsRestrictionsAreAppliedAndLifted() {
        val registry = defaultEnforcerRegistry(context)
        registry.applyAll(Policy(version = 1, restrictions = allRestrictions))
        val active = dpm.getUserRestrictions(admin)
        val expected = buildList {
            add(UserManager.DISALLOW_CONFIG_VPN)
            if (Build.VERSION.SDK_INT >= 29) add(UserManager.DISALLOW_CONFIG_PRIVATE_DNS)
            add(UserManager.DISALLOW_FACTORY_RESET)
            add(UserManager.DISALLOW_SAFE_BOOT)
            add(UserManager.DISALLOW_ADD_USER)
            add(UserManager.DISALLOW_CONFIG_DATE_TIME)
        }
        assertTrue("automatic time on", dpm.getAutoTimeEnabled(admin))
        expected.forEach { assertTrue("$it on API ${Build.VERSION.SDK_INT}", active.getBoolean(it)) }

        registry.applyAll(Policy(version = 2))
        val after = dpm.getUserRestrictions(admin)
        expected.forEach { assertFalse("$it still set after it was turned off", after.getBoolean(it)) }
        val failures = registry.collectAllEvents().filter { it.payload["status"]?.toString()?.trim('"') == "failed" }
        assertTrue("failures reported: ${failures.map { it.payload }}", failures.isEmpty())
    }

    @Test
    fun chromeConfigurationIsSetAndCleared() {
        val registry = defaultEnforcerRegistry(context)
        registry.applyAll(Policy(version = 1, browser = Policy.Browser(
            safeSearch = true, youtube = "strict", secureDnsOff = true, blockedSites = listOf("example.com"),
        )))
        val set = dpm.getApplicationRestrictions(admin, BrowserPolicyDecision.CHROME)
        assertEquals(true, set.getBoolean("ForceGoogleSafeSearch"))
        assertEquals(2, set.getInt("ForceYouTubeRestrict"))
        assertEquals("off", set.getString("DnsOverHttpsMode"))
        assertEquals(listOf("example.com"), set.getStringArray("URLBlocklist")?.toList())

        registry.applyAll(Policy(version = 2))
        assertTrue("Chrome's configuration cleared", dpm.getApplicationRestrictions(admin, BrowserPolicyDecision.CHROME).isEmpty)
    }

    @Test
    fun aLockWindowCoveringNowLocksThePhone() {
        shell("input keyevent KEYCODE_WAKEUP")
        val power = context.getSystemService(PowerManager::class.java)
        val now = Calendar.getInstance()
        val hour = now.get(Calendar.HOUR_OF_DAY)
        val window = Policy.LockSchedule.Window(days = (1..7).toList(), fromHour = hour, toHour = (hour + 1) % 24)
        val registry = defaultEnforcerRegistry(context)
        try {
            registry.applyAll(Policy(version = 1, lockSchedule = Policy.LockSchedule(enabled = true, windows = listOf(window))))
            val deadline = SystemClock.uptimeMillis() + 5_000
            while (power.isInteractive && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(200)
            assertFalse("the screen should be off inside a lock window", power.isInteractive)
        } finally {
            registry.applyAll(Policy(version = 2))
            shell("input keyevent KEYCODE_WAKEUP")
        }
    }

    @Test
    fun theAppOpensWhileManaged() {
        shell("input keyevent KEYCODE_WAKEUP")
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { assertFalse("MainActivity closed itself", it.isFinishing) }
        }
    }
}
