package com.manara.agent.enforcers

import android.provider.CallLog

/** Pure decision for [CallLogEnforcer]: which calls to report, and what each one says (ADR-0008). */
object CallLogDecision {
    const val MAX_PER_RUN = 200
    const val PRIVATE_NUMBER = "private"

    data class Row(val id: Long, val number: String?, val type: Int, val dateMillis: Long, val durationSeconds: Long)

    data class Batch(val calls: List<Row>, val newCursor: Long)

    /**
     * Calls after [cursor], oldest first, so a long backlog is sent in order and the cursor never
     * skips one. [cursor] starts at the moment the parent turned this on: earlier calls never leave.
     */
    fun newCalls(rows: List<Row>, cursor: Long): Batch {
        val calls = rows.filter { it.dateMillis > cursor }.sortedBy { it.dateMillis }.take(MAX_PER_RUN)
        return Batch(calls, calls.lastOrNull()?.dateMillis ?: cursor)
    }

    /** Null for a kind that isn't a call this phone took part in (voicemail, answered elsewhere). */
    fun direction(type: Int): String? = when (type) {
        CallLog.Calls.INCOMING_TYPE -> "incoming"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing"
        CallLog.Calls.MISSED_TYPE -> "missed"
        CallLog.Calls.REJECTED_TYPE -> "rejected"
        CallLog.Calls.BLOCKED_TYPE -> "blocked"
        else -> null
    }

    fun number(raw: String?): String = raw?.trim().takeUnless { it.isNullOrEmpty() } ?: PRIVATE_NUMBER
}
