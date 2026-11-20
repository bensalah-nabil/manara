package com.manara.agent.enforcers

import com.manara.agent.policy.Policy
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar

class BedtimeDecisionTest {
    private val schoolNights = listOf(
        Policy.LockSchedule.Window(
            days = listOf(Calendar.SUNDAY, Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY, Calendar.THURSDAY),
            fromHour = 21,
            toHour = 7,
        ),
    )
    private val launchable = setOf(
        "com.zhiliaoapp.musically", "com.instagram.android", "com.samsung.android.dialer", "com.samsung.android.messaging",
        "com.sec.android.app.clockpackage", "com.android.settings", "com.manara.agent",
    )
    private val keepOpen = setOf(
        "com.samsung.android.dialer", "com.samsung.android.messaging", "com.sec.android.app.clockpackage",
        "com.android.settings", "com.manara.agent",
    )

    private fun hold(
        day: Int,
        hour: Int,
        windows: List<Policy.LockSchedule.Window> = schoolNights,
        apps: Set<String> = launchable,
        allowed: Set<String> = emptySet(),
    ) = BedtimeDecision.appsToHold(windows, day, hour, apps, keepOpen, allowed)

    @Test
    fun atBedtimeEveryAppPausesExceptCallsTextsTheClockSettingsAndManara() {
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22))
    }

    @Test
    fun theWindowCarriesPastMidnightIntoTheNextMorning() {
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.TUESDAY, 6))
        assertEquals(emptySet<String>(), hold(Calendar.TUESDAY, 7)) // 07:00, bedtime is over
    }

    @Test
    fun outsideBedtimeNothingIsHeld() {
        assertEquals(emptySet<String>(), hold(Calendar.MONDAY, 20))
        assertEquals(emptySet<String>(), hold(Calendar.FRIDAY, 22)) // not a school night
    }

    @Test
    fun aScheduleTurnedOffOrEmptiedHoldsNothing() {
        assertEquals(emptySet<String>(), hold(Calendar.MONDAY, 22, windows = emptyList()))
    }

    @Test
    fun anAppInstalledDuringBedtimeIsPausedOnTheNextCheck() {
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android", "com.new.game"), hold(Calendar.MONDAY, 22, apps = launchable + "com.new.game"))
    }

    @Test
    fun anAppKeptOpenThatIsNotInstalledChangesNothing() {
        val withoutClock = launchable - "com.sec.android.app.clockpackage"
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22, apps = withoutClock))
    }

    @Test
    fun anAppTheParentAllowsStaysOpen() {
        val apps = launchable + "com.kanout.mawaqit"
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22, apps = apps, allowed = setOf("com.kanout.mawaqit")))
    }

    @Test
    fun anAllowedAppThePhoneDoesNotHaveChangesNothing() {
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22, allowed = setOf("com.athan")))
    }

    @Test
    fun allowingAnAppPausesNothingOutsideBedtime() {
        assertEquals(emptySet<String>(), hold(Calendar.MONDAY, 20, allowed = setOf("com.kanout.mawaqit")))
    }

    @Test
    fun authenticatorAppsStayOpenAtBedtimeWithoutBeingAllowed() {
        val apps = launchable + "com.google.android.apps.authenticator2" + "com.azure.authenticator"
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22, apps = apps))
    }

    @Test
    fun whatsAppQuranAndEveryAuthenticatorStayOpenAtBedtime() {
        val apps = launchable + BedtimeDecision.ALWAYS_OPEN
        assertEquals(setOf("com.zhiliaoapp.musically", "com.instagram.android"), hold(Calendar.MONDAY, 22, apps = apps))
        listOf("com.whatsapp", "com.whatsapp.w4b", "com.quran.labs.androidquran", "com.greentech.quran", "io.ente.auth")
            .forEach { assert(it in BedtimeDecision.ALWAYS_OPEN) { "$it must stay open" } }
    }

    @Test
    fun everyAlwaysOpenIdLooksLikeAnAndroidPackage() {
        val packageName = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
        BedtimeDecision.ALWAYS_OPEN.forEach { assert(packageName.matches(it)) { "$it is not a package name" } }
    }
}
