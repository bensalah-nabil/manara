package com.manara.agent.enforcers

import com.manara.agent.R
import com.manara.agent.text.Words

/**
 * Pure: the wording of Android's "blocked by your admin" dialog (roadmap D2, ADR-0009).
 *
 * Android keeps one short support message for the whole phone, not one per app, and shows it for
 * every action Manara blocks: a paused app, but also a factory reset or a VPN setting. (AOSP
 * android14-release and android15-release, Settings `ActionDisabledByAdminDialogHelper
 * .setAdminSupportDetails`: the dialog's body is `getShortSupportMessageForUser` whatever the
 * restriction; only its title changes.) So the message first says who manages the phone, then why
 * apps are paused right now, in sentences that stay true whichever action was blocked.
 */
object BlockNoticeDecision {
    /** `setShortSupportMessage`: "If the message is longer than 200 characters it may be truncated." */
    const val SHORT_LIMIT = 200

    data class Notice(val short: String, val long: String)

    /** The rules that have their own sentence, in the order the sentences appear. */
    private val worded = listOf(BedtimeDecision.RULE, "time-limit", "browser-block")

    /** [holds] as [AppPauses] keeps them; [label] names an app for the long message. */
    fun notice(holds: Map<String, Set<String>>, words: Words, label: (String) -> String): Notice {
        val held = holds.filterValues { it.isNotEmpty() }
        val rules = worded.filter { it in held } + held.keys.filter { it !in worded }.sorted()
        val managed = words.get(R.string.block_notice_managed)
        val open = words.get(R.string.block_notice_open)
        // At bedtime every app but calls, the clock and Settings is paused: that sentence says it all.
        val reasons = if (BedtimeDecision.RULE in held) listOf(reason(BedtimeDecision.RULE, words))
        else rules.map { reason(it, words) }.distinct()

        val short = listOf(
            listOf(managed) + reasons + open,
            listOf(managed) + listOfNotNull(words.get(R.string.block_notice_other).takeIf { reasons.isNotEmpty() }) + open,
            listOf(managed, open),
        ).map { it.joinToString(" ") }.firstOrNull { it.length <= SHORT_LIMIT } ?: managed.take(SHORT_LIMIT)

        val long = buildString {
            append(managed)
            rules.forEach { rule ->
                append("\n\n").append(reason(rule, words)).append('\n')
                append(held.getValue(rule).map(label).sortedWith(String.CASE_INSENSITIVE_ORDER).joinToString(", "))
            }
            append("\n\n").append(open)
        }
        return Notice(short, long)
    }

    private fun reason(rule: String, words: Words): String = when (rule) {
        BedtimeDecision.RULE -> words.get(R.string.block_notice_bedtime)
        "time-limit" -> words.get(R.string.block_notice_time_limit)
        "browser-block" -> words.get(R.string.block_notice_browser)
        else -> words.get(R.string.block_notice_other)
    }
}
