package com.manara.agent.release

/**
 * Pure. Should this phone finish a release that was cut off?
 *
 * Seen on the SM-A528B (2026-11-11): the parent's Remove reached the phone, the server deleted the
 * phone from the account and revoked its token, then the phone began lifting its rules. Turning
 * call history off revoked Manara's own READ_CALL_LOG, and Android kills an app whose runtime
 * permission is revoked (`PermissionManagerServiceImpl`: `killUid(..., KILL_APP_REASON_PERMISSIONS_REVOKED)`,
 * AOSP android14-release). Manara died still Device Owner, with a dead token: nobody could release it.
 *
 * Two signals, either enough:
 * - [releasing]: the release marker [ReleaseProgress] writes before touching anything. Set only by a
 *   release the parent asked for (the console's Remove, or the offline code).
 * - A phone from before that marker existed: its rules are gone ([hasPolicy] false; only a release
 *   deletes them, enrollment always stores some) while it still holds a token the server refuses.
 *   A server outage or lost tokens can't trigger this: the phone would still have its rules.
 */
object ReleaseRecovery {
    fun shouldFinish(
        releasing: Boolean,
        deviceOwner: Boolean,
        hasToken: Boolean,
        hasPolicy: Boolean,
        serverRefused: Boolean,
    ): Boolean = deviceOwner && (releasing || (hasToken && !hasPolicy && serverRefused))
}
