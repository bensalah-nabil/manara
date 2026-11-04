package com.manara.agent.enforcers

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.manara.agent.policy.Policy
import com.manara.agent.policy.PolicySummary
import com.manara.agent.policy.CollectionStatusReader
import com.manara.agent.policy.CollectionStatusSummary
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.events.EventQueue
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DailyUsageReaderDeviceTest {
    @Test
    fun availableUsageFeedsRemainingBudgetWithoutApplyingPolicy() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("dailyUsageMode") == "available")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val reader = DailyUsageReader(context)
        assertTrue(reader.hasAccess())
        val usage = requireNotNull(reader.readMinutes())
        val used = requireNotNull(usage[context.packageName])
        assertTrue(used >= 0L)
        val rule = Policy.TimeLimits.Rule("probe", listOf(context.packageName), Math.toIntExact(used + 5L))
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(rule)))
        assertTrue(PolicySummary.describe(policy, usage).contains("Time left today: 5 min (estimated)"))
        assertTrue(TimeLimitDecision.decide(listOf(rule), usage, emptyMap()).toSuspend.isEmpty())
        val exhausted = rule.copy(dailyMinutes = Math.toIntExact(used))
        assertEquals(0L, TimeLimitDecision.remainingMinutes(exhausted, usage))
        assertEquals(listOf(context.packageName),
            TimeLimitDecision.decide(listOf(exhausted), usage, emptyMap()).toSuspend)
        val status = runBlocking { CollectionStatusReader(context, ManaraDatabase.get(context)).read(policy) }
        assertEquals(CollectionStatusSummary.Usage.READABLE, status.usage)
        assertTrue(CollectionStatusSummary.describe(policy, status.usage, status.location)
            .contains("Usage data: readable"))
    }

    @Test
    fun deniedUsageIsUnavailableRatherThanUnusedBudget() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("dailyUsageMode") == "unavailable")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val reader = DailyUsageReader(context)
        assertFalse(reader.hasAccess())
        val usage = reader.readMinutes()
        assertNull(usage)
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(
            Policy.TimeLimits.Rule("probe", listOf(context.packageName), 60)
        )))
        val summary = PolicySummary.describe(policy, usage)
        assertTrue(summary.contains("Time left today: unavailable"))
        assertFalse(summary.contains("60 min (estimated)"))
        val status = runBlocking { CollectionStatusReader(context, ManaraDatabase.get(context)).read(policy) }
        assertEquals(CollectionStatusSummary.Usage.ACCESS_MISSING, status.usage)
        assertNull(status.usageMinutes)
    }

    @Test
    fun enrolledLocationOffRemainsReadOnly() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("dailyUsageMode") == "available")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = ManaraDatabase.get(context)
        val policy = requireNotNull(PolicyCache(db).current())
        assertFalse(policy.location.enabled)
        assertEquals(false, LocationEnforcer.isLocationOn(context))
        val beforePolicy = db.policyDao().get()
        val beforeEvents = EventQueue(db).drainBatch(Int.MAX_VALUE)
        val beforeObservation = db.locationObservationDao().get()
        val status = CollectionStatusReader(context, db).read(policy)
        assertTrue(CollectionStatusSummary.describe(policy, status.usage, status.location)
            .contains("Location: off by policy"))
        assertEquals(beforePolicy, db.policyDao().get())
        assertEquals(beforeEvents, EventQueue(db).drainBatch(Int.MAX_VALUE))
        assertEquals(beforeObservation, db.locationObservationDao().get())
        assertEquals(4, db.openHelper.readableDatabase.version)
        assertEquals(false, LocationEnforcer.isLocationOn(context))
    }
}
