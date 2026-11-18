package com.manara.agent.enforcers

import com.manara.agent.R
import com.manara.agent.text.ResourceWords
import com.manara.agent.text.Words
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockNoticeDecisionTest {
    private val english = ResourceWords()
    private val names = mapOf(
        "com.instagram.android" to "Instagram",
        "com.zhiliaoapp.musically" to "TikTok",
        "com.opera.browser" to "Opera",
    )
    private val label: (String) -> String = { names[it] ?: it }
    private fun say(name: String) = english.raw(name)!!

    private val everything = mapOf(
        "time-limit" to setOf("com.zhiliaoapp.musically", "com.instagram.android"),
        "browser-block" to setOf("com.opera.browser"),
        "prayer-pause" to setOf("com.instagram.android"),
    )

    @Test
    fun withNothingPausedItSaysWhoManagesThePhone() {
        // Also what a blocked factory reset or VPN setting shows: the same message for every action.
        val notice = BlockNoticeDecision.notice(emptyMap(), english, label)
        assertEquals("${say("block_notice_managed")} ${say("block_notice_open")}", notice.short)
    }

    @Test
    fun eachReasonIsSaidOnceWhateverTheNumberOfApps() {
        val notice = BlockNoticeDecision.notice(everything - "prayer-pause", english, label)
        assertEquals(
            listOf("block_notice_managed", "block_notice_time_limit", "block_notice_browser", "block_notice_open")
                .joinToString(" ") { say(it) },
            notice.short,
        )
    }

    @Test
    fun aRuleWithoutItsOwnSentenceIsStillExplained() {
        val notice = BlockNoticeDecision.notice(mapOf("prayer-pause" to setOf("com.instagram.android")), english, label)
        assertTrue(notice.short, notice.short.contains(say("block_notice_other")))
    }

    @Test
    fun aRuleHoldingNothingGivesNoReason() {
        val notice = BlockNoticeDecision.notice(mapOf("time-limit" to emptySet()), english, label)
        assertEquals("${say("block_notice_managed")} ${say("block_notice_open")}", notice.short)
    }

    @Test
    fun theLongMessageListsEachAppUnderItsReason() {
        val long = BlockNoticeDecision.notice(everything, english, label).long
        assertTrue(long, long.contains("${say("block_notice_time_limit")}\nInstagram, TikTok"))
        assertTrue(long, long.contains("${say("block_notice_browser")}\nOpera"))
        assertTrue(long, long.contains("${say("block_notice_other")}\nInstagram"))
        assertTrue(long, long.startsWith(say("block_notice_managed")) && long.endsWith(say("block_notice_open")))
    }

    @Test
    fun theWholeMessageFitsInEveryLanguage() {
        mapOf(
            "en" to english,
            "fr" to ResourceWords("src/main/res/values-fr/strings.xml"),
            "ar" to ResourceWords("src/main/res/values-ar/strings.xml"),
        ).forEach { (language, words) ->
            // Today's two rules both fit in full; a rule added later may make it fall back.
            val short = BlockNoticeDecision.notice(everything - "prayer-pause", words, label).short
            assertTrue("$language fell back: $short", short.contains(words.get(R.string.block_notice_time_limit)))
            assertTrue("$language fell back: $short", short.contains(words.get(R.string.block_notice_browser)))
            listOf(short, BlockNoticeDecision.notice(everything, words, label).short).forEach {
                assertTrue("$language: ${it.length} characters", it.length <= BlockNoticeDecision.SHORT_LIMIT)
            }
        }
    }

    @Test
    fun atBedtimeTheBedtimeSentenceSaysItAll() {
        val holds = everything + (BedtimeDecision.RULE to setOf("com.whatsapp", "com.opera.browser"))
        val notice = BlockNoticeDecision.notice(holds, english, label)
        assertEquals(
            listOf("block_notice_managed", "block_notice_bedtime", "block_notice_open").joinToString(" ") { say(it) },
            notice.short,
        )
        // The long message still lists every app under each reason.
        assertTrue(notice.long, notice.long.contains("${say("block_notice_bedtime")}\ncom.whatsapp, Opera"))
        assertTrue(notice.long, notice.long.contains("${say("block_notice_time_limit")}\nInstagram, TikTok"))
        listOf(
            ResourceWords("src/main/res/values-fr/strings.xml"),
            ResourceWords("src/main/res/values-ar/strings.xml"),
        ).forEach { words ->
            val short = BlockNoticeDecision.notice(holds, words, label).short
            assertTrue(short, short.contains(words.get(R.string.block_notice_bedtime)) && short.length <= BlockNoticeDecision.SHORT_LIMIT)
        }
    }

    @Test
    fun aWordingTooLongForAndroidFallsBackToAShorterOne() {
        val wordy = object : Words {
            override fun get(id: Int, vararg args: Any): String =
                if (id == R.string.block_notice_time_limit) "x".repeat(150) else english.get(id, *args)

            override fun plural(id: Int, count: Int): String = english.plural(id, count)
        }
        val short = BlockNoticeDecision.notice(everything, wordy, label).short
        assertEquals(
            listOf("block_notice_managed", "block_notice_other", "block_notice_open").joinToString(" ") { say(it) },
            short,
        )
    }
}
