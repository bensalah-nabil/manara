import type { Phone } from './api.ts'

export type Problem = 'never_seen' | 'silent' | 'setup_failed' | 'setup_stuck' | null

const HOUR = 60 * 60 * 1000

/** What, if anything, an admin should look at for this phone. */
export function phoneProblem(phone: Phone, now: number, silentHours = 24): Problem {
    if (phone.setupStatus === 'failed') return 'setup_failed'
    const setupAt = Date.parse(phone.setupUpdatedAt ?? '')
    if (phone.setupStatus && phone.setupStatus !== 'done' && Number.isFinite(setupAt) && now - setupAt > 2 * HOUR) return 'setup_stuck'
    const seen = Date.parse(phone.lastSeen ?? '')
    // Go's zero time ("0001-01-01") also means never.
    if (!Number.isFinite(seen) || seen < Date.UTC(2000, 0, 1)) return 'never_seen'
    if (now - seen > silentHours * HOUR) return 'silent'
    return null
}

export const PROBLEM_TEXT: Record<Exclude<Problem, null>, string> = {
    never_seen: 'Never checked in',
    silent: 'Not reporting',
    setup_failed: 'Setup failed',
    setup_stuck: 'Setup stuck',
}

export function agoText(iso: string | undefined, now: number): string {
    const at = Date.parse(iso ?? '')
    if (!Number.isFinite(at) || at < Date.UTC(2000, 0, 1)) return 'never'
    const minutes = Math.round((now - at) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.round(minutes / 60)
    if (hours < 48) return `${hours} h ago`
    return `${Math.round(hours / 24)} days ago`
}

export const ACTION_TEXT: Record<string, string> = {
    opened_console: 'Opened the admin console',
    viewed_overview: 'Viewed the overview',
    listed_accounts: 'Listed accounts',
    listed_phones: 'Listed phones',
    viewed_admin_log: 'Viewed the admin log',
}
