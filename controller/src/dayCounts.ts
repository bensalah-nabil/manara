import type { AppChangeItem } from './appChanges.ts'
import { isUnknownCaller } from './callAlerts.ts'
import type { CallItem } from './callLog.ts'

/**
 * Counts per local day for the activity charts. [main] is what the chart is about and is drawn in
 * the brand colour; [context] is the rest, in grey (the dataviz "emphasis" form). Pure, so it is
 * tested without a browser. Nothing here is collected: it counts what the lists below already show.
 */
export interface DayCount {
    /** The browser's local date, YYYY-MM-DD. */
    date: string
    main: number
    context: number
}

export function localDate(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The [count] local dates ending with [now]'s, oldest first; by calendar day, so a clock change doesn't skip one. */
export function lastDates(now: Date, count: number): string[] {
    return Array.from({ length: count }, (_, i) =>
        localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i), 12).getTime()))
}

function countByDay<T extends { occurredAt: string }>(items: T[], isMain: (item: T) => boolean, now: Date, count: number): DayCount[] {
    const days = lastDates(now, count).map((date) => ({ date, main: 0, context: 0 }))
    const index = new Map(days.map((day, i) => [day.date, i]))
    for (const item of items) {
        const i = index.get(localDate(Date.parse(item.occurredAt)))
        if (i === undefined) continue
        if (isMain(item)) days[i].main++
        else days[i].context++
    }
    return days
}

/**
 * Calls per day. With call alerts on ([known] is the parent's list), a call from a number the parent
 * doesn't know is the main part; with them off ([known] null) every call is, and nothing is grey.
 */
export function callsPerDay(calls: CallItem[], known: string[] | null, now = new Date(), count = 30): DayCount[] {
    return countByDay(calls, (call) => known === null || isUnknownCaller(call, known), now, count)
}

/** Apps installed (main, drawn above the line) and removed (context, below it) per day. */
export function appChangesPerDay(items: AppChangeItem[], now = new Date(), count = 30): DayCount[] {
    return countByDay(items, (item) => item.action === 'installed', now, count)
}
