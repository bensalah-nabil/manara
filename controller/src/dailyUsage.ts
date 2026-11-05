import type { EventItem } from './protection.ts'

export interface AppUsage {
    packageName: string
    minutes: number
}

export interface DailyUsage {
    date: string
    totalMinutes: number
    apps: AppUsage[]
    reportedAt: string
}

const MAX_DAYS = 7
const MAX_APPS = 30
const DATE = /^\d{4}-\d{2}-\d{2}$/

function validMinutes(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readApps(value: unknown): AppUsage[] {
    if (!Array.isArray(value)) return []
    const apps: AppUsage[] = []
    for (const item of value) {
        if (typeof item !== 'object' || item === null) continue
        const { package: name, minutes } = item as Record<string, unknown>
        if (typeof name !== 'string' || name.trim() === '' || !validMinutes(minutes)) continue
        apps.push({ packageName: name.trim(), minutes })
    }
    return apps.sort((a, b) => b.minutes - a.minutes || a.packageName.localeCompare(b.packageName)).slice(0, MAX_APPS)
}

/**
 * One entry per phone-local date, newest date first: the phone sends snapshots through the day,
 * so for each date the latest snapshot wins. Reports that are malformed are skipped.
 */
export function summarizeDailyUsage(events: EventItem[]): DailyUsage[] {
    const latest = new Map<string, { time: number; day: DailyUsage }>()
    for (const event of events) {
        if (event.kind !== 'usage_report') continue
        const { date, totalMinutes, apps } = event.payload ?? {}
        if (typeof date !== 'string' || !DATE.test(date) || !validMinutes(totalMinutes)) continue
        const time = Date.parse(event.occurredAt)
        if (Number.isNaN(time)) continue
        const seen = latest.get(date)
        if (seen && seen.time >= time) continue
        latest.set(date, { time, day: { date, totalMinutes, apps: readApps(apps), reportedAt: event.occurredAt } })
    }
    return [...latest.values()]
        .map((entry) => entry.day)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_DAYS)
}

export function minutesText(minutes: number): string {
    const whole = Math.round(minutes)
    if (whole < 60) return `${whole} min`
    return `${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, '0')} min`
}
