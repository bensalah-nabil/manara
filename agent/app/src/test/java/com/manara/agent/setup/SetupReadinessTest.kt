package com.manara.agent.setup

import com.manara.agent.setup.SetupReadiness.Action
import com.manara.agent.setup.SetupReadiness.Item
import com.manara.agent.setup.SetupReadiness.Snapshot
import com.manara.agent.setup.SetupReadiness.State
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SetupReadinessTest {
    private val ready = Snapshot(sdkInt = 34, wifi = true, batteryPercent = 80, charging = false, developerOptions = true, wirelessDebugging = true)

    private fun state(result: SetupReadiness.Result, item: Item) = result.lines.first { it.item == item }.state

    @Test
    fun everythingOnIsReady() {
        val result = SetupReadiness.evaluate(ready)
        assertTrue(result.ready)
        assertNull(result.next)
        assertTrue(result.lines.all { it.state == State.OK })
    }

    @Test
    fun theParentIsSentToOneScreenAtATime() {
        assertEquals(Action.OPEN_WIFI, SetupReadiness.evaluate(ready.copy(wifi = false, developerOptions = false)).next)
        assertEquals(Action.OPEN_ABOUT_PHONE, SetupReadiness.evaluate(ready.copy(developerOptions = false, wirelessDebugging = false)).next)
        assertEquals(Action.OPEN_DEVELOPER_OPTIONS, SetupReadiness.evaluate(ready.copy(wirelessDebugging = false)).next)
    }

    @Test
    fun aLowBatteryIsAdviceNotABlocker() {
        val low = SetupReadiness.evaluate(ready.copy(batteryPercent = 20))
        assertEquals(State.MISSING, state(low, Item.BATTERY))
        assertTrue(low.ready)
        assertEquals(State.OK, state(SetupReadiness.evaluate(ready.copy(batteryPercent = 20, charging = true)), Item.BATTERY))
    }

    @Test
    fun androidTenCannotBeSetUpThisWay() {
        val old = SetupReadiness.evaluate(ready.copy(sdkInt = 29))
        assertFalse(old.ready)
        assertNull(old.next)
        assertEquals(State.MISSING, state(old, Item.ANDROID))
    }

    @Test
    fun aSettingThePhoneWontReportDoesNotBlock() {
        val unknown = SetupReadiness.evaluate(ready.copy(wirelessDebugging = null, wifi = null))
        assertTrue(unknown.ready)
        assertEquals(State.UNKNOWN, state(unknown, Item.WIRELESS_DEBUGGING))
        assertNull(unknown.next)
    }
}
