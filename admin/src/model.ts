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
    viewed_agent_update: 'Viewed releases',
    viewed_notice: 'Viewed the notice',
    two_step_off: 'Turned off two-step sign-in',
    password_reset_sent: 'Sent a password-reset link',
    suspended_account: 'Suspended an account',
    reactivated_account: 'Reactivated an account',
    deleted_account: 'Deleted an account',
    reset_setup: 'Cleared a guided setup',
    removed_phone: 'Removed a phone',
    offered_version: 'Offered a version to phones',
    paused_updates: 'Paused every update',
    updates_back_to_server_settings: "Used Render's update setting again",
    set_notice: 'Showed a notice',
    cleared_notice: 'Removed the notice',
}

/** One week of the dashboard: starts on Monday, sums what the days hold. */
export interface WeekTotal {
    week: string
    newAccounts: number
    newPhones: number
}

/** Days (YYYY-MM-DD, oldest first) grouped into weeks starting on Monday. */
export function weekly(days: { date: string; newAccounts: number; newPhones: number }[]): WeekTotal[] {
    const weeks = new Map<string, WeekTotal>()
    for (const day of days) {
        const d = new Date(day.date + 'T12:00:00Z')
        const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
        const w = weeks.get(monday) ?? { week: monday, newAccounts: 0, newPhones: 0 }
        w.newAccounts += day.newAccounts
        w.newPhones += day.newPhones
        weeks.set(monday, w)
    }
    return [...weeks.values()]
}

/** A round top for an axis: 1, 2 or 5 times a power of ten, at least the largest value. */
export function niceMax(value: number): number {
    if (value <= 0) return 1
    const power = 10 ** Math.floor(Math.log10(value))
    for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power
    return 10 * power
}

export function share(part: number, whole: number): string {
    if (whole <= 0) return '–'
    return `${Math.round((part / whole) * 100)}%`
}

export const ALERT_KIND_TEXT: Record<string, string> = {
    tamper: 'A protection stopped working',
    silent_phone: 'A phone stopped checking in',
    unknown_call: 'A call from an unknown number',
    other: 'Other alerts',
}
