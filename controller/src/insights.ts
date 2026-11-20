import type { Policy } from './policy.ts'
import type { EventItem } from './protection.ts'
import { minutesText } from './dailyUsage.ts'
import { t } from './i18n.ts'
import { categoryLabel } from './ruleCards.ts'

/**
 * Insights from what the phone already reports (daily usage reports and limit hits): nothing new
 * is collected, and the child sees the same data on the phone (ADR-0001). Pure, so it is tested
 * without a browser; the panel only draws what this returns.
 */

/** One usage report: the phone's cumulative minutes for its local date, as of [time]. */
export interface Report {
    time: number
    date: string
    total: number
    apps: Map<string, number>
}

export interface Day {
    date: string
    /** Null: the phone sent no report that day (off, offline, or reporting turned off). */
    minutes: number | null
}

export type Suggestion =
    | { kind: 'limit'; packageName: string; minutes: number }
    | { kind: 'bedtime'; fromHour: number; toHour: number }

export interface Insight {
    id: string
    tone: 'attention' | 'info'
    title: string
    detail: string
    suggestion?: Suggestion
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

const KNOWN_APPS: Record<string, string> = {
    'com.zhiliaoapp.musically': 'TikTok',
    'com.ss.android.ugc.trill': 'TikTok',
    'com.instagram.android': 'Instagram',
    'com.google.android.youtube': 'YouTube',
    'com.google.android.apps.youtube.kids': 'YouTube Kids',
    'com.whatsapp': 'WhatsApp',
    'com.snapchat.android': 'Snapchat',
    'com.facebook.katana': 'Facebook',
    'com.facebook.orca': 'Messenger',
    'com.roblox.client': 'Roblox',
    'com.mojang.minecraftpe': 'Minecraft',
    'com.supercell.clashroyale': 'Clash Royale',
    'com.supercell.brawlstars': 'Brawl Stars',
    'com.dts.freefireth': 'Free Fire',
    'com.tencent.ig': 'PUBG Mobile',
    'com.king.candycrushsaga': 'Candy Crush',
    'com.twitter.android': 'X',
    'com.reddit.frontpage': 'Reddit',
    'com.discord': 'Discord',
    'com.netflix.mediaclient': 'Netflix',
    'com.android.chrome': 'Chrome',
    'org.telegram.messenger': 'Telegram',
    'com.quran.labs.androidquran': 'Quran for Android',
}

/** A readable app name: a known one, else the package's last part, capitalized. */
export function appName(packageName: string): string {
    const known = KNOWN_APPS[packageName]
    if (known) return known
    const last = packageName.split('.').filter(Boolean).pop() ?? packageName
    return last.charAt(0).toUpperCase() + last.slice(1)
}

/** Valid usage reports, oldest first. */
export function parseReports(events: EventItem[]): Report[] {
    const reports: Report[] = []
    for (const event of events) {
        if (event.kind !== 'usage_report') continue
        const { date, totalMinutes, apps } = event.payload ?? {}
        const time = Date.parse(event.occurredAt)
        if (typeof date !== 'string' || !DATE.test(date) || Number.isNaN(time)) continue
        if (typeof totalMinutes !== 'number' || !Number.isFinite(totalMinutes) || totalMinutes < 0) continue
        const map = new Map<string, number>()
        if (Array.isArray(apps)) {
            for (const item of apps) {
                const { package: pkg, minutes } = (item ?? {}) as Record<string, unknown>
                if (typeof pkg === 'string' && pkg.trim() && typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0) {
                    map.set(pkg.trim(), minutes)
                }
            }
        }
        reports.push({ time, date, total: totalMinutes, apps: map })
    }
    return reports.sort((a, b) => a.time - b.time)
}

/** The last report of each date: the phone's count for that whole day so far. */
export function lastPerDate(reports: Report[]): Map<string, Report> {
    const last = new Map<string, Report>()
    for (const r of reports) last.set(r.date, r) // reports are oldest first
    return last
}

function isoDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

/** The [count] dates ending with [today], oldest first, with null where nothing was reported. */
export function dailySeries(reports: Report[], today: string, count = 30): Day[] {
    const last = lastPerDate(reports)
    const end = Date.parse(today + 'T00:00:00Z')
    return Array.from({ length: count }, (_, i) => {
        const date = isoDate(end - (count - 1 - i) * DAY_MS)
        const report = last.get(date)
        return { date, minutes: report ? report.total : null }
    })
}

export interface WeekSummary {
    /** The week's Monday and Sunday, YYYY-MM-DD. */
    from: string
    to: string
    /** Screen time over the days the phone reported; null when it reported none. */
    minutes: number | null
    reportedDays: number
    /** Minutes a day, over the days reported; null when none was. */
    average: number | null
    /** The week before, the same way, to compare with. */
    previousAverage: number | null
    /** The week's busiest apps, most minutes first. */
    topApps: { packageName: string; minutes: number }[]
}

/**
 * Last week, Monday to Sunday before the week of [today]: the report the weekly email points to.
 * A day counts with its last report, as in [dailySeries]; apps are summed over the week's days
 * (each report lists the day's busiest 30, so a rarely used app can be short).
 */
export function lastWeek(reports: Report[], today: string, top = 3): WeekSummary {
    const last = lastPerDate(reports)
    const day = Date.parse(today + 'T00:00:00Z')
    const monday = day - ((new Date(day).getUTCDay() + 6) % 7 + 7) * DAY_MS
    const daysOf = (start: number) => Array.from({ length: 7 }, (_, i) => last.get(isoDate(start + i * DAY_MS)))
        .filter((r): r is Report => r !== undefined)
    const average = (days: Report[]) => days.length ? days.reduce((sum, r) => sum + r.total, 0) / days.length : null
    const week = daysOf(monday)
    const apps = new Map<string, number>()
    for (const r of week) for (const [pkg, minutes] of r.apps) apps.set(pkg, (apps.get(pkg) ?? 0) + minutes)
    return {
        from: isoDate(monday),
        to: isoDate(monday + 6 * DAY_MS),
        minutes: week.length ? week.reduce((sum, r) => sum + r.total, 0) : null,
        reportedDays: week.length,
        average: average(week),
        previousAverage: average(daysOf(monday - 7 * DAY_MS)),
        topApps: [...apps]
            .filter(([, minutes]) => minutes > 0)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, top)
            .map(([packageName, minutes]) => ({ packageName, minutes })),
    }
}

export interface AppRow {
    packageName: string
    /** Minutes a day over the recent days the phone reported. */
    minutes: number
    /** The same over the 7 days before; null when the phone reported none of them. */
    previous: number | null
}

export interface AppWeek {
    rows: AppRow[]
    /** How many of the 7 recent days, and of the 7 before, the phone reported. */
    days: number
    previousDays: number
}

/**
 * Each app's minutes a day over the 7 days before [today] (today is still counting), against the 7
 * days before those: busiest [top] first. Averages are over the days the phone reported, so a day it
 * was off doesn't drag them down. Each report lists the day's 30 busiest apps, so an app missing from
 * one counts as 0 that day.
 */
export function appWeek(reports: Report[], today: string, top = 8): AppWeek {
    const last = lastPerDate(reports)
    const day = Date.parse(today + 'T00:00:00Z')
    const span = (firstBack: number) => Array.from({ length: 7 }, (_, i) => last.get(isoDate(day - (firstBack + i) * DAY_MS)))
        .filter((r): r is Report => r !== undefined)
    const perDay = (days: Report[]) => {
        const sums = new Map<string, number>()
        for (const r of days) for (const [pkg, minutes] of r.apps) sums.set(pkg, (sums.get(pkg) ?? 0) + minutes)
        return new Map([...sums].map(([pkg, sum]) => [pkg, sum / days.length]))
    }
    const recent = span(1)
    const before = span(8)
    const now = perDay(recent)
    const then = perDay(before)
    return {
        rows: [...now]
            .filter(([, minutes]) => minutes >= 0.5)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, top)
            .map(([packageName, minutes]) => ({ packageName, minutes, previous: before.length ? then.get(packageName) ?? 0 : null })),
        days: recent.length,
        previousDays: before.length,
    }
}

/** Each date's busiest [top] apps, from its last report: what a day's tooltip names. */
export function topAppsByDate(reports: Report[], top = 3): Map<string, { packageName: string; minutes: number }[]> {
    const out = new Map<string, { packageName: string; minutes: number }[]>()
    for (const [date, r] of lastPerDate(reports)) {
        out.set(date, [...r.apps]
            .filter(([, minutes]) => minutes >= 1)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, top)
            .map(([packageName, minutes]) => ({ packageName, minutes })))
    }
    return out
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** A day "well above usual": at least 50% and 30 minutes over the median, with 5 days to compare. */
export function aboveUsual(minutes: number, usual: number | null, comparedDays: number): boolean {
    return usual !== null && comparedDays >= 5 && minutes >= usual * 1.5 && minutes - usual >= 30
}

/**
 * Minutes used per weekday (0 = Sunday) and hour, averaged over the days seen: each report's
 * increase over the one before it on the same date is counted in the hour it arrived. The first
 * report of a date can't be placed in time and is left out, so this is an approximation.
 */
export function hourGrid(reports: Report[], hourOf: (ms: number) => { weekday: number; hour: number } = localHour): {
    minutes: number[][]
    days: number[]
} {
    const minutes = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    const datesPerWeekday = Array.from({ length: 7 }, () => new Set<string>())
    let previous: Report | null = null
    for (const r of reports) {
        if (previous && previous.date === r.date) {
            const delta = r.total - previous.total
            if (delta > 0) {
                const { weekday, hour } = hourOf(r.time)
                minutes[weekday][hour] += delta
                datesPerWeekday[weekday].add(r.date)
            }
        }
        previous = r
    }
    const days = datesPerWeekday.map((s) => s.size)
    return { minutes: minutes.map((row, d) => row.map((m) => (days[d] ? m / days[d] : 0))), days }
}

function localHour(ms: number): { weekday: number; hour: number } {
    const d = new Date(ms)
    return { weekday: d.getDay(), hour: d.getHours() }
}

/** Nights (evening date) in the last [nights] with at least [minMinutes] used from 22:00 to 05:59. */
export function lateNights(reports: Report[], now: number, nights = 7, minMinutes = 10,
    hourOf: (ms: number) => { weekday: number; hour: number } = localHour): { count: number; latestHour: number | null } {
    const since = now - nights * DAY_MS
    const perNight = new Map<string, number>()
    let latestHour: number | null = null
    let previous: Report | null = null
    for (const r of reports) {
        if (previous && previous.date === r.date && r.time >= since) {
            const delta = r.total - previous.total
            const { hour } = hourOf(r.time)
            if (delta > 0 && (hour >= 22 || hour < 6)) {
                // After midnight still belongs to the evening before.
                const night = hour < 6 ? isoDate(r.time - DAY_MS) : isoDate(r.time)
                perNight.set(night, (perNight.get(night) ?? 0) + delta)
                const ordered = hour < 6 ? hour + 24 : hour
                if (latestHour === null || ordered > latestHour) latestHour = ordered
            }
        }
        previous = r
    }
    const count = [...perNight.values()].filter((m) => m >= minMinutes).length
    return { count, latestHour: latestHour === null ? null : latestHour % 24 }
}

function roundTo15(minutes: number): number {
    return Math.max(15, Math.round(minutes / 15) * 15)
}

interface PolicyRules {
    limitedPackages: Map<string, number>
    hasNightLock: boolean
}

function readRules(policy: Policy | null): PolicyRules {
    const limitedPackages = new Map<string, number>()
    const limits = policy?.timeLimits as { enabled?: boolean; rules?: { packages?: string[]; dailyMinutes?: number }[] } | undefined
    if (limits?.enabled) {
        for (const rule of limits.rules ?? []) {
            for (const pkg of rule.packages ?? []) limitedPackages.set(pkg, rule.dailyMinutes ?? 0)
        }
    }
    const schedule = policy?.lockSchedule as { enabled?: boolean; windows?: { fromHour: number; toHour: number }[] } | undefined
    const hasNightLock = !!schedule?.enabled && (schedule.windows ?? []).some((w) =>
        w.fromHour > w.toHour ? true : w.fromHour <= 23 && w.toHour > 23)
    return { limitedPackages, hasNightLock }
}

/**
 * What is worth a parent's look, most important first. Each comes with a rule it could add,
 * unless the phone already has one, or no rule would fit (then it is just information).
 */
export function findInsights(input: {
    reports: Report[]
    limitHits: { category: string; occurredAt: string }[]
    policy: Policy | null
    today: string
    now: number
    hourOf?: (ms: number) => { weekday: number; hour: number }
}): Insight[] {
    const { reports, limitHits, policy, today, now } = input
    const rules = readRules(policy)
    const insights: Insight[] = []
    const last = lastPerDate(reports)
    const todayReport = last.get(today)
    const previousDays = [...last.values()].filter((r) => r.date < today && Date.parse(today) - Date.parse(r.date) <= 14 * DAY_MS)

    // 1. An app that appeared recently and is used a lot (before spikes: a new app's usual is 0).
    const recent = [...last.values()].filter((r) => Date.parse(today) - Date.parse(r.date) < 3 * DAY_MS)
    const older = [...last.values()].filter((r) => Date.parse(today) - Date.parse(r.date) >= 3 * DAY_MS)
    if (recent.length > 0 && older.length >= 5) {
        const seenBefore = new Set(older.flatMap((r) => [...r.apps.keys()]))
        const recentPkgs = new Set(recent.flatMap((r) => [...r.apps.keys()]))
        for (const pkg of recentPkgs) {
            if (seenBefore.has(pkg)) continue
            const average = recent.reduce((sum, r) => sum + (r.apps.get(pkg) ?? 0), 0) / recent.length
            if (average < 20) continue
            const limited = rules.limitedPackages.get(pkg)
            insights.push({
                id: `new:${pkg}`,
                tone: 'attention',
                title: t('insights.newApp', { app: appName(pkg) }),
                detail: t('insights.newAppDetail', { time: minutesText(average) }),
                suggestion: limited === undefined ? { kind: 'limit', packageName: pkg, minutes: 30 } : undefined,
            })
        }
    }

    // 2. An app far above its own usual today.
    if (todayReport && previousDays.length >= 3) {
        for (const [pkg, minutes] of todayReport.apps) {
            if (insights.some((i) => i.id === `new:${pkg}`)) continue
            const usual = median(previousDays.map((r) => r.apps.get(pkg) ?? 0)) ?? 0
            if (minutes >= 30 && minutes >= Math.max(usual * 2, usual + 30)) {
                const limited = rules.limitedPackages.get(pkg)
                insights.push({
                    id: `spike:${pkg}`,
                    tone: 'attention',
                    title: t('insights.spike', { app: appName(pkg), time: minutesText(minutes) }),
                    detail: t('insights.spikeDetail', { time: minutesText(usual) }) +
                        (limited !== undefined ? t('insights.alreadyLimited', { time: minutesText(limited) }) : ''),
                    suggestion: limited === undefined ? { kind: 'limit', packageName: pkg, minutes: roundTo15(Math.max(usual, 30)) } : undefined,
                })
            }
        }
    }

    // 3. Late-night use.
    const nights = lateNights(reports, now, 7, 10, input.hourOf)
    if (nights.count >= 3) {
        insights.push({
            id: 'late-nights',
            tone: 'attention',
            title: t('insights.lateTitle', { n: nights.count }),
            detail: t('insights.lateDetail', { latest: nights.latestHour !== null ? t('insights.lateLatest', { hour: String(nights.latestHour).padStart(2, '0') }) : '' }) +
                (rules.hasNightLock ? t('insights.lateLocked') : ''),
            suggestion: rules.hasNightLock ? undefined : { kind: 'bedtime', fromHour: 22, toHour: 7 },
        })
    }

    // 4. A limit reached almost every day: worth a talk, or a different limit.
    const weekAgo = now - 7 * DAY_MS
    const daysPerCategory = new Map<string, Set<string>>()
    for (const hit of limitHits) {
        const at = Date.parse(hit.occurredAt)
        if (Number.isNaN(at) || at < weekAgo) continue
        const set = daysPerCategory.get(hit.category) ?? new Set<string>()
        set.add(isoDate(at))
        daysPerCategory.set(hit.category, set)
    }
    for (const [category, days] of daysPerCategory) {
        if (days.size < 5) continue
        insights.push({
            id: `limit:${category}`,
            tone: 'info',
            title: t('insights.limitTitle', { name: categoryLabel(category), n: days.size }),
            detail: t('insights.limitDetail'),
        })
    }

    // 5. Screen time rising week over week.
    const series = dailySeries(reports, today, 14)
    const thisWeek = series.slice(7).map((d) => d.minutes).filter((m): m is number => m !== null)
    const lastWeek = series.slice(0, 7).map((d) => d.minutes).filter((m): m is number => m !== null)
    if (thisWeek.length >= 5 && lastWeek.length >= 5) {
        const avgNow = thisWeek.reduce((a, b) => a + b, 0) / thisWeek.length
        const avgBefore = lastWeek.reduce((a, b) => a + b, 0) / lastWeek.length
        if (avgBefore > 0 && avgNow >= avgBefore * 1.3 && avgNow - avgBefore >= 30) {
            insights.push({
                id: 'rising',
                tone: 'info',
                title: t('insights.upTitle', { n: Math.round((avgNow / avgBefore - 1) * 100) }),
                detail: t('insights.upDetail', { now: minutesText(avgNow), before: minutesText(avgBefore) }),
            })
        }
    }
    return insights
}

/** The rule a suggestion adds, merged into the policy (existing rules and unknown fields kept). */
export function applySuggestion(policy: Policy, suggestion: Suggestion): Policy {
    if (suggestion.kind === 'limit') {
        const current = (policy.timeLimits ?? {}) as { enabled?: boolean; rules?: unknown[] }
        const rule = { category: appName(suggestion.packageName), packages: [suggestion.packageName], dailyMinutes: suggestion.minutes }
        return { ...policy, timeLimits: { ...current, enabled: true, rules: [...(current.rules ?? []), rule] } }
    }
    const current = (policy.lockSchedule ?? {}) as { enabled?: boolean; windows?: unknown[] }
    const window = { days: [1, 2, 3, 4, 5, 6, 7], fromHour: suggestion.fromHour, toHour: suggestion.toHour }
    return { ...policy, lockSchedule: { ...current, enabled: true, windows: [...(current.windows ?? []), window] } }
}

/** What the parent is asked before a suggestion is saved. */
export function suggestionText(suggestion: Suggestion): string {
    return suggestion.kind === 'limit'
        ? t('insights.suggestLimit', { time: minutesText(suggestion.minutes), app: appName(suggestion.packageName) })
        : t('insights.suggestLock', { from: String(suggestion.fromHour).padStart(2, '0'), to: String(suggestion.toHour).padStart(2, '0') })
}
