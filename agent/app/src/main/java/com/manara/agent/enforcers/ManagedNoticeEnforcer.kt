package com.manara.agent.enforcers

import android.app.NotificationManager
import android.content.Context
import com.manara.agent.events.Event
import com.manara.agent.policy.Policy

/**
 * ADR-0001: the phone always shows it is managed. Android lets the phone's user block that notice:
 * on Android 14 its channel can be set to "none" (PreferencesHelper.updateFixedImportance only
 * locks system apps' channels, android14-release; android15/16 lock it only after the first
 * reboot), and on Android 11/12 all of Manara's notifications can be turned off. Nothing a device
 * owner can call prevents it (audit 2026-11-21). So this rule checks, on every sync, that the
 * notice can still show, and reports it to the parent as a broken protection when it can't: the
 * promise stays honest, and the parent can talk to the child about it.
 */
class ManagedNoticeEnforcer(private val context: Context) : PolicyEnforcer {
    override val id = "managed-notice"

    private val health = HealthTracker(context, context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE), id)

    override fun apply(policy: Policy) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        health.observe(CHECK_VISIBLE, ManagedNoticeDecision.visible(
            notificationsEnabled = manager.areNotificationsEnabled(),
            channelImportance = manager.getNotificationChannel(CHANNEL_ID)?.importance,
        ))
    }

    /** A released phone shows no notice; a later enrollment starts from a clean slate. */
    override fun release() {
        health.forget(CHECK_VISIBLE)
    }

    override fun collectEvents(): List<Event> = emptyList()

    private companion object {
        const val PREFS_NAME = "managed_notice_enforcer"
        const val CHECK_VISIBLE = "managed_notice_visible"
        // ManagedNoticeService's channel.
        const val CHANNEL_ID = "manara_managed_notice"
    }
}

/** Pure: whether the managed notice can be seen, from what NotificationManager says. */
object ManagedNoticeDecision {
    /**
     * Visible unless all notifications are off or the channel is blocked (IMPORTANCE_NONE, 0). A
     * channel not created yet (null) counts as visible: ManagedNoticeService creates it at start.
     */
    fun visible(notificationsEnabled: Boolean, channelImportance: Int?): Boolean =
        notificationsEnabled && channelImportance != NotificationManager.IMPORTANCE_NONE
}
