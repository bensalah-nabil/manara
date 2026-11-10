package com.manara.agent.ui

import com.manara.agent.policy.CollectionStatusSummary.LocationStatus
import com.manara.agent.policy.CollectionStatusSummary.Usage
import com.manara.agent.policy.Policy
import com.manara.agent.text.English
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeModelTest {
    @Test
    fun screenFollowsEnrollmentAndManagement() {
        assertEquals(HomeModel.Screen.CONNECT, HomeModel.screen(enrolled = false, deviceOwner = false))
        assertEquals(HomeModel.Screen.SETUP, HomeModel.screen(enrolled = true, deviceOwner = false))
        assertEquals(HomeModel.Screen.MANAGED, HomeModel.screen(enrolled = true, deviceOwner = true))
        // Managed but between accounts (a code-opened move): connect to the new one.
        assertEquals(HomeModel.Screen.CONNECT, HomeModel.screen(enrolled = false, deviceOwner = true))
    }

    @Test
    fun setupNeedsAndroid11() {
        assertFalse(HomeModel.setupSupported(29))
        assertTrue(HomeModel.setupSupported(30))
    }

    private val full = Policy(
        version = 3,
        timeLimits = Policy.TimeLimits(true, listOf(Policy.TimeLimits.Rule("Games", listOf("a", "b"), 90))),
        location = Policy.Location(enabled = true, intervalMinutes = 30),
        usageReport = Policy.UsageReport(enabled = true),
        lockSchedule = Policy.LockSchedule(true, listOf(Policy.LockSchedule.Window(listOf(2, 3, 4, 5, 6), 21, 7))),
        siteFilter = Policy.SiteFilter(true, "family.example"),
        restrictions = Policy.Restrictions(blockFactoryReset = true, blockDebugging = true),
    )

    @Test
    fun theChildSeesEverythingTheParentCanSee() {
        val seen = ChildView.seen(English, full).map { it.title }
        assertEquals(listOf("Where this phone is", "Time spent in each app", "When a time limit is reached", "Whether Manara is working"), seen)
        assertTrue(ChildView.seen(English, full).first().detail.contains("every 30 minutes"))
    }

    @Test
    fun withNothingOnOnlyTheHealthReportIsSeen() {
        assertEquals(listOf("Whether Manara is working"), ChildView.seen(English, Policy(version = 1)).map { it.title })
        assertEquals(emptyList<ChildView.Line>(), ChildView.rules(English, Policy(version = 1)))
    }

    @Test
    fun rulesReadPlainly() {
        val rules = ChildView.rules(English, full)
        assertEquals(ChildView.Line("Games", "1 h 30 min a day, 2 apps"), rules[0])
        assertEquals(ChildView.Line("Locked 21:00–07:00", "Weekdays"), rules[1])
        assertEquals("Website filter", rules[2].title)
        assertEquals(ChildView.Line("Settings you can't change", "Factory reset, developer options"), rules[3])
    }

    @Test
    fun zeroMinutesReadsAsBlocked() {
        val policy = Policy(version = 1, timeLimits = Policy.TimeLimits(true, listOf(Policy.TimeLimits.Rule("Social", listOf("x"), 0))))
        assertEquals(ChildView.Line("Social", "Blocked, 1 app"), ChildView.rules(English, policy)[0])
    }

    @Test
    fun weekendsAndOddDaysRead() {
        val weekend = Policy(version = 1, lockSchedule = Policy.LockSchedule(true, listOf(Policy.LockSchedule.Window(listOf(7, 1), 22, 8))))
        assertEquals("Weekends", ChildView.rules(English, weekend)[0].detail)
        val odd = Policy(version = 1, lockSchedule = Policy.LockSchedule(true, listOf(Policy.LockSchedule.Window(listOf(4, 2), 22, 8))))
        assertEquals("Mon, Wed", ChildView.rules(English, odd)[0].detail)
    }

    @Test
    fun attentionOnlyForWhatIsOnAndBroken() {
        val broken = ChildView.attention(English, full, Usage.ACCESS_MISSING, LocationStatus(toggleOn = false))
        assertEquals(listOf(ChildView.Fix.USAGE_ACCESS, ChildView.Fix.LOCATION_SETTING), broken.map { it.fix })
        assertEquals(emptyList<ChildView.Attention>(), ChildView.attention(English, full, Usage.READABLE, LocationStatus(toggleOn = true)))
        // Nothing asks for usage data or location, so nothing is broken.
        assertEquals(emptyList<ChildView.Attention>(), ChildView.attention(English, Policy(version = 1), Usage.ACCESS_MISSING, LocationStatus(toggleOn = false)))
    }

    @Test
    fun lastContactIsRelative() {
        val now = 10_000_000_000L
        assertEquals("Not connected yet", ChildView.lastContact(English, null, now))
        assertEquals("Connected just now", ChildView.lastContact(English, now - 30_000, now))
        assertEquals("Last connected 5 min ago", ChildView.lastContact(English, now - 5 * 60_000, now))
        assertEquals("Last connected 3 h ago", ChildView.lastContact(English, now - 3 * 3_600_000, now))
        assertEquals("Last connected 4 days ago", ChildView.lastContact(English, now - 4 * 86_400_000L, now))
    }

    @Test
    fun theCardRulesAreNamedInThePhonesLanguage() {
        val french = com.manara.agent.text.ResourceWords("src/main/res/values-fr/strings.xml")
        val arabic = com.manara.agent.text.ResourceWords("src/main/res/values-ar/strings.xml")
        assertEquals("Social media", ChildView.categoryName(English, "Social media"))
        assertEquals("Réseaux sociaux", ChildView.categoryName(french, "Social media"))
        assertEquals("الألعاب", ChildView.categoryName(arabic, "Games"))
        // A parent's own rule name is theirs: shown as typed.
        assertEquals("Roblox", ChildView.categoryName(french, "roblox"))
        assertEquals("App limit", ChildView.categoryName(English, " "))
    }

    @Test
    fun arabicCountsAppsWithItsOwnForms() {
        val arabic = com.manara.agent.text.ResourceWords("src/main/res/values-ar/strings.xml")
        val policy = Policy(version = 1, lockSchedule = Policy.LockSchedule(true, listOf(Policy.LockSchedule.Window(listOf(4, 2), 22, 8))))
        assertEquals("الاثنين، الأربعاء", ChildView.rules(arabic, policy)[0].detail)
    }
}
