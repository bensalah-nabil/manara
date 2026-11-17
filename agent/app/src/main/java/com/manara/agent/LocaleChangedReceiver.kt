package com.manara.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.manara.agent.enforcers.AppPauses

/**
 * The phone's language changed: the block screen's wording follows it. `setShortSupportMessage`'s
 * documentation leaves this to the admin app, and Android delivers `ACTION_LOCALE_CHANGED` to a
 * manifest receiver (AOSP android14-release and android15-release,
 * `ActivityManagerService.updateConfiguration`: sent with `FLAG_RECEIVER_INCLUDE_BACKGROUND`).
 * A language chosen for Manara alone sends no broadcast; the next rule run rewrites the wording.
 */
class LocaleChangedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_LOCALE_CHANGED) return
        AppPauses(context).showReasons()
    }
}
