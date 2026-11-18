import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import { t } from './i18n.ts'
import { PACKAGE_NAME, parsePackages } from './timeLimits.ts'

export interface LockWindow {
    days: number[]
    fromHour: number
    toHour: number
}

export interface LockSchedule {
    enabled: boolean
    windows?: LockWindow[]
    /** Apps that stay open during a window, besides calls, texts, the clock and Settings. */
    allowedApps?: string[]
}

export interface Draft {
    enabled: boolean
    windows: LockWindow[]
    /** One package name per line, as the parent typed them. */
    allowedApps?: string
}

/** The server refuses more (domain.MaxBedtimeAllowedApps). */
export const MAX_ALLOWED_APPS = 50

/**
 * Prayer-time apps, whose adhan a paused app could not sound (Android hides a paused app's
 * notifications and stops it ringing the phone). Each id checked on Google Play: Mawaqit, Al-Azan,
 * Muslim Pro, Athan, Prayer Now, My Prayer. An app the phone doesn't have is ignored there.
 */
export const PRAYER_APPS = [
    'com.kanout.mawaqit',
    'com.github.meypod.al_azan',
    'com.bitsmedia.android.muslimpro',
    'com.athan',
    'com.AppRocks.now.prayer',
    'com.haz.prayer',
]

/** [text] with the prayer-time apps added once, keeping what the parent already wrote first. */
export function withPrayerApps(text: string): string {
    return [...new Set([...parsePackages(text), ...PRAYER_APPS])].join('\n')
}

export type ValidationResult = { ok: true; schedule: LockSchedule } | { ok: false; errors: string[] }

/** The agent numbers days like java.util.Calendar: Sunday is 1, Saturday is 7. */
export const DAYS: { value: number; label: string }[] = [
    { value: 1, label: t('day.sun') },
    { value: 2, label: t('day.mon') },
    { value: 3, label: t('day.tue') },
    { value: 4, label: t('day.wed') },
    { value: 5, label: t('day.thu') },
    { value: 6, label: t('day.fri') },
    { value: 7, label: t('day.sat') },
]

export function toDraft(policy: Policy): Draft {
    const schedule = policy.lockSchedule as LockSchedule | undefined
    return {
        enabled: schedule?.enabled ?? false,
        windows: (schedule?.windows ?? []).map((window) => ({ ...window, days: [...window.days] })),
        allowedApps: (schedule?.allowedApps ?? []).join('\n'),
    }
}

export function emptyWindow(): LockWindow {
    return { days: [], fromHour: 22, toHour: 7 }
}

export function hourText(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`
}

const isHour = (value: number) => Number.isInteger(value) && value >= 0 && value <= 23

export function validateDraft(draft: Draft): ValidationResult {
    const errors: string[] = []
    const windows: LockWindow[] = []

    draft.windows.forEach((window, index) => {
        const label = t('scheduleEditor.window', { n: index + 1 })
        const days = [...new Set(window.days)].sort((a, b) => a - b)
        if (days.length === 0) errors.push(t('scheduleEditor.errDay', { label }))
        if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) errors.push(t('scheduleEditor.errDayInvalid', { label }))
        if (!isHour(window.fromHour) || !isHour(window.toHour)) errors.push(t('scheduleEditor.errHours', { label }))
        else if (window.fromHour === window.toHour) {
            errors.push(t('scheduleEditor.errSame', { label }))
        }
        windows.push({ days, fromHour: window.fromHour, toHour: window.toHour })
    })

    const allowedApps = parsePackages(draft.allowedApps ?? '')
    for (const name of allowedApps) {
        if (!PACKAGE_NAME.test(name)) errors.push(t('scheduleEditor.errPackage', { name }))
    }
    if (allowedApps.length > MAX_ALLOWED_APPS) errors.push(t('scheduleEditor.errTooMany', { max: MAX_ALLOWED_APPS }))

    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, schedule: { enabled: draft.enabled, windows, ...(allowedApps.length > 0 ? { allowedApps } : {}) } }
}

export function applySchedule(policy: Policy, schedule: LockSchedule): Policy {
    return withSection(policy, 'lockSchedule', schedule)
}
