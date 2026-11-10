import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import { joinList, t } from './i18n.ts'

export interface LockWindow {
    days: number[]
    fromHour: number
    toHour: number
}

export interface LockSchedule {
    enabled: boolean
    windows?: LockWindow[]
}

export interface Draft {
    enabled: boolean
    windows: LockWindow[]
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
    }
}

export function emptyWindow(): LockWindow {
    return { days: [], fromHour: 22, toHour: 7 }
}

export function hourText(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`
}

export function describeWindow(window: LockWindow): string {
    const names = DAYS.filter((day) => window.days.includes(day.value)).map((day) => day.label)
    const overnight = window.fromHour > window.toHour
    return t('scheduleEditor.describe', { days: joinList(names), from: hourText(window.fromHour), to: hourText(window.toHour) }) + (overnight ? t('scheduleEditor.nextMorning') : '')
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

    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, schedule: { enabled: draft.enabled, windows } }
}

export function applySchedule(policy: Policy, schedule: LockSchedule): Policy {
    return withSection(policy, 'lockSchedule', schedule)
}
