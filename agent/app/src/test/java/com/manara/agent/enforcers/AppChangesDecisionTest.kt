package com.manara.agent.enforcers

import com.manara.agent.enforcers.AppChangesDecision.App
import com.manara.agent.enforcers.AppChangesDecision.Change
import org.junit.Assert.assertEquals
import org.junit.Test

class AppChangesDecisionTest {
    private val now = 1_763_640_000_000L // 2026-11-20
    private val own = "com.manara.agent"
    private val before = mapOf("com.whatsapp" to "WhatsApp", "com.android.chrome" to "Chrome")

    private fun app(pkg: String, label: String, at: Long = now - 60_000) = App(pkg, label, at)

    @Test
    fun theFirstLookOnlySavesTheList() {
        val current = listOf(app("com.whatsapp", "WhatsApp"), app("com.zhiliaoapp.musically", "TikTok"))
        assertEquals(emptyList<Change>(), AppChangesDecision.changes(null, current, own, now))
        assertEquals(mapOf("com.whatsapp" to "WhatsApp", "com.zhiliaoapp.musically" to "TikTok"), AppChangesDecision.snapshot(current, own))
    }

    @Test
    fun aNewAppIsReportedWithItsOwnInstallTime() {
        val installedAt = now - 3_600_000
        val current = listOf(app("com.whatsapp", "WhatsApp"), app("com.android.chrome", "Chrome"), app("com.zhiliaoapp.musically", "TikTok", installedAt))
        assertEquals(
            listOf(Change(AppChangesDecision.INSTALLED, "com.zhiliaoapp.musically", "TikTok", installedAt)),
            AppChangesDecision.changes(before, current, own, now),
        )
    }

    @Test
    fun aRemovedAppIsReportedNowUnderTheNameItHad() {
        val current = listOf(app("com.whatsapp", "WhatsApp"))
        assertEquals(
            listOf(Change(AppChangesDecision.REMOVED, "com.android.chrome", "Chrome", now)),
            AppChangesDecision.changes(before, current, own, now),
        )
    }

    @Test
    fun nothingChangedMeansNothingToReport() {
        val current = listOf(app("com.android.chrome", "Chrome"), app("com.whatsapp", "WhatsApp"))
        assertEquals(emptyList<Change>(), AppChangesDecision.changes(before, current, own, now))
    }

    @Test
    fun anUnbelievableInstallTimeIsReplacedByNow() {
        val current = before.map { (p, l) -> app(p, l) } + app("org.example.vpn", "VPN", at = now + 86_400_000) + app("org.example.zero", "Zero", at = 0)
        val changes = AppChangesDecision.changes(before, current, own, now)
        assertEquals(listOf(now, now), changes.map { it.at })
    }

    @Test
    fun manaraItselfIsNeverReported() {
        val current = before.map { (p, l) -> app(p, l) } + app(own, "Manara")
        assertEquals(emptyList<Change>(), AppChangesDecision.changes(before, current, own, now))
        assertEquals(emptyList<Change>(), AppChangesDecision.changes(before + (own to "Manara"), before.map { (p, l) -> app(p, l) }, own, now))
    }

    @Test
    fun aVeryLongNameIsCut() {
        val long = "x".repeat(200)
        val change = AppChangesDecision.changes(before, before.map { (p, l) -> app(p, l) } + app("org.example.long", long), own, now).single()
        assertEquals(AppChangesDecision.MAX_LABEL, change.label.length)
    }

    @Test
    fun changesComeOldestFirst() {
        val current = listOf(app("org.b", "B", now - 1000), app("org.a", "A", now - 5000))
        val changes = AppChangesDecision.changes(emptyMap(), current, own, now)
        assertEquals(listOf("org.a", "org.b"), changes.map { it.packageName })
    }
}
