package com.manara.agent.enforcers

/**
 * Pure: turns call notifications from messaging apps into calls (ADR-0008, source 2). Android
 * gives no other way to see a WhatsApp, Messenger, Telegram or Viber call. Only the app, the
 * direction and the rough length come out: never the caller's name, never any other notification.
 */
object CallNotificationDecision {
    /** Messaging apps whose calls are counted, by the name the parent sees. */
    val APPS = mapOf(
        "com.whatsapp" to "WhatsApp",
        "com.whatsapp.w4b" to "WhatsApp Business",
        "com.facebook.orca" to "Messenger",
        "org.telegram.messenger" to "Telegram",
        "org.thunderdog.challegram" to "Telegram X",
        "com.viber.voip" to "Viber",
    )

    /** What one notification says about a call, read from Android's own fields, not its text. */
    enum class Signal { RINGING, IN_CALL, MISSED, NONE }

    // Notification.CallStyle (API 31) stores its type here; the constants are 1, 2 and 3.
    private const val CALL_TYPE_INCOMING = 1
    private const val CALL_TYPE_ONGOING = 2
    private const val CALL_TYPE_SCREENING = 3
    private const val CATEGORY_CALL = "call"
    private const val CATEGORY_MISSED_CALL = "missed_call"

    fun signal(category: String?, callType: Int, ongoing: Boolean, usesChronometer: Boolean): Signal = when {
        category == CATEGORY_MISSED_CALL -> Signal.MISSED
        callType == CALL_TYPE_ONGOING -> Signal.IN_CALL
        callType == CALL_TYPE_INCOMING || callType == CALL_TYPE_SCREENING -> Signal.RINGING
        category == CATEGORY_CALL && ongoing && usesChronometer -> Signal.IN_CALL
        category == CATEGORY_CALL -> Signal.RINGING
        else -> Signal.NONE
    }

    data class Call(val app: String, val direction: String, val startMillis: Long, val durationSeconds: Long)

    /** One app's call in progress, as last seen. */
    data class Open(val ringingSince: Long? = null, val inCallSince: Long? = null)

    /** A missed call the app reports itself, within this of one already counted, is the same call. */
    const val SAME_CALL_MILLIS = 120_000L

    data class Step(val open: Open?, val call: Call?)

    /** A call notification posted or updated. */
    fun posted(app: String, open: Open?, signal: Signal, now: Long, lastMissedAt: Long?): Step = when (signal) {
        Signal.RINGING -> Step(Open(ringingSince = open?.ringingSince ?: now, inCallSince = open?.inCallSince), null)
        Signal.IN_CALL -> Step(Open(ringingSince = open?.ringingSince, inCallSince = open?.inCallSince ?: now), null)
        Signal.MISSED ->
            if (lastMissedAt != null && now - lastMissedAt < SAME_CALL_MILLIS) Step(open, null)
            else Step(open, Call(app, "missed", now, 0))
        Signal.NONE -> Step(open, null)
    }

    /**
     * The call notification went away: the call ended. Answered after ringing is incoming; in a
     * call with no ringing first is outgoing (its length includes dialling); ringing alone is missed.
     */
    fun removed(app: String, open: Open?, now: Long): Call? {
        open ?: return null
        val inCall = open.inCallSince
        return when {
            inCall != null -> Call(
                app,
                if (open.ringingSince != null) "incoming" else "outgoing",
                open.ringingSince ?: inCall,
                ((now - inCall) / 1000).coerceAtLeast(0),
            )
            open.ringingSince != null -> Call(app, "missed", open.ringingSince, 0)
            else -> null
        }
    }
}
