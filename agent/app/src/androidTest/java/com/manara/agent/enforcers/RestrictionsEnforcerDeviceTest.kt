package com.manara.agent.enforcers

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.manara.agent.OwnerReceiver
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.SyncWorker
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 29)
class RestrictionsEnforcerDeviceTest {
    @Test
    fun removedPrivateDnsRestrictionIsReappliedByWorker() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("restrictionDriftMode") == "private_dns")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val manager = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, OwnerReceiver::class.java)
        val key = UserManager.DISALLOW_CONFIG_PRIVATE_DNS
        assertTrue(manager.isDeviceOwnerApp(context.packageName))
        sync(context)
        val cache = PolicyCache(ManaraDatabase.get(context))
        val policy = requireNotNull(cache.current())
        assertTrue("Enable blockPrivateDnsConfig through the console API first", policy.restrictions.blockPrivateDnsConfig)
        assertTrue(manager.getUserRestrictions(admin).getBoolean(key))
        try {
            manager.clearUserRestriction(admin, key)
            assertFalse("The restriction must actually disappear", manager.getUserRestrictions(admin).getBoolean(key))
            sync(context)
            assertEquals(policy.version, cache.currentVersion())
            assertTrue("The worker must reapply the missing restriction", manager.getUserRestrictions(admin).getBoolean(key))
            sync(context)
            sync(context)
        } finally {
            if (requireNotNull(cache.current()).restrictions.blockPrivateDnsConfig) {
                manager.addUserRestriction(admin, key)
            } else {
                manager.clearUserRestriction(admin, key)
            }
        }
    }

    @Test
    fun syncConfiguredPolicy() = runBlocking {
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(arguments.getString("restrictionDriftMode") == "sync")
        val expected = requireNotNull(arguments.getString("expectedPrivateDnsRestriction")).toBooleanStrict()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        sync(context)
        val policy = requireNotNull(PolicyCache(ManaraDatabase.get(context)).current())
        assertEquals(expected, policy.restrictions.blockPrivateDnsConfig)
        val manager = context.getSystemService(DevicePolicyManager::class.java)
        assertEquals(expected, manager.getUserRestrictions(ComponentName(context, OwnerReceiver::class.java))
            .getBoolean(UserManager.DISALLOW_CONFIG_PRIVATE_DNS))
    }

    private suspend fun sync(context: Context) {
        val requestId = SyncWorker.enqueueOneTime(context)
        val result = withTimeout(60_000) {
            WorkManager.getInstance(context).getWorkInfoByIdFlow(requestId)
                .filterNotNull().first { it.state.isFinished }
        }
        assertEquals("Worker $requestId must complete successfully", WorkInfo.State.SUCCEEDED, result.state)
    }
}
