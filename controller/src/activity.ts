import { t } from './i18n.ts'
import type { MessageKey } from './i18n.ts'

/** One line of the account's own log (GET /console/account/activity). */
export interface ActivityEntry {
    action: string
    deviceId?: string
    detail?: string
    at: string
}

const COMMANDS: Record<string, MessageKey> = {
    lock_now: 'activity.cmd.lockNow',
    request_location: 'activity.cmd.location',
    release: 'activity.cmd.release',
    apply_policy: 'activity.cmd.applyPolicy',
    ping: 'activity.cmd.ping',
}

const ACTIONS: Record<string, MessageKey> = {
    password_reset: 'activity.passwordReset',
    two_step_on: 'activity.twoStepOn',
    two_step_off: 'activity.twoStepOff',
    account_changed: 'activity.accountChanged',
    phone_code_created: 'activity.phoneCode',
    rules_changed: 'activity.rulesChanged',
    phone_edited: 'activity.phoneEdited',
    phone_removed: 'activity.phoneRemoved',
    setup_accounts_cleared: 'activity.setupAccountsCleared',
    pairing_code_sent: 'activity.pairingCode',
    setup_finished: 'activity.setupFinished',
    change_cancelled: 'activity.changeCancelled',
}

/**
 * What the parent reads for an entry. [phoneName] names a phone still in the account; a removed
 * phone's entries stay in the log, so those read "a removed phone".
 */
export function activityText(entry: ActivityEntry, phoneName: (deviceId: string) => string | undefined): string {
    const phone = entry.deviceId ? phoneName(entry.deviceId) ?? t('activity.removedPhone') : ''
    if (entry.action === 'signed_in') return t(entry.detail === 'two_step' ? 'activity.signedInTwoStep' : 'activity.signedIn')
    if (entry.action === 'command_sent') return t(COMMANDS[entry.detail ?? ''] ?? 'activity.cmd.other', { phone })
    const key = ACTIONS[entry.action]
    return key ? t(key, { phone }) : t('activity.other')
}
