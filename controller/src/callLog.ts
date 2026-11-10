import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import type { EventItem } from './protection.ts'
import { dateLocale, t } from './i18n.ts'

export interface CallLogPolicy {
    enabled: boolean
}

export interface Draft {
    enabled: boolean
}

export function toDraft(policy: Policy): Draft {
    const section = policy.callLog as CallLogPolicy | undefined
    return { enabled: section?.enabled === true }
}

export function applyCallLog(policy: Policy, section: CallLogPolicy): Policy {
    return withSection(policy, 'callLog', section)
}

export const CALL_LOG_WARNING =
    t('calls.warning')

export type Direction = 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked'

export interface CallItem {
    id: string
    /** Absent for a call seen in a messaging app, which gives no number. */
    number?: string
    /** The messaging app, for a call made in one. */
    app?: string
    direction: Direction
    occurredAt: string
    durationSeconds: number
}

const DIRECTIONS: Record<Direction, string> = {
    incoming: t('calls.incoming'),
    outgoing: t('calls.outgoing'),
    missed: t('calls.missed'),
    rejected: t('calls.rejected'),
    blocked: t('calls.blocked'),
}

export const MAX_SHOWN = 100

/** Newest first. A malformed report is left out rather than shown as a call that didn't happen. */
export function summarizeCalls(events: EventItem[]): CallItem[] {
    const calls: CallItem[] = []
    for (const event of events) {
        if (event.kind !== 'call' || Number.isNaN(Date.parse(event.occurredAt))) continue
        const payload = (event.payload ?? {}) as { number?: unknown; app?: unknown; direction?: unknown; durationSeconds?: unknown }
        const number = typeof payload.number === 'string' ? payload.number : undefined
        const app = typeof payload.app === 'string' && payload.app !== '' ? payload.app : undefined
        if ((number === undefined && app === undefined) || typeof payload.direction !== 'string' || !Object.hasOwn(DIRECTIONS, payload.direction)) continue
        const duration = typeof payload.durationSeconds === 'number' && payload.durationSeconds > 0 ? payload.durationSeconds : 0
        calls.push({ id: event.id, number, app, direction: payload.direction as Direction, occurredAt: event.occurredAt, durationSeconds: duration })
    }
    calls.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    return withoutRepeats(calls).slice(0, MAX_SHOWN)
}

/** Two sources can see one call (WhatsApp writes a few to the call log): the one with a number wins. */
const SAME_CALL_MS = 2 * 60_000

function withoutRepeats(calls: CallItem[]): CallItem[] {
    const kept: CallItem[] = []
    for (const call of calls) {
        const twin = call.app === undefined ? -1 : kept.findIndex((other) => other.app === call.app &&
            Math.abs(Date.parse(other.occurredAt) - Date.parse(call.occurredAt)) < SAME_CALL_MS)
        if (twin < 0) kept.push(call)
        else if (kept[twin].number === undefined && call.number !== undefined) kept[twin] = call
    }
    return kept
}

export interface CallDay {
    key: string
    label: string
    calls: CallItem[]
}

function dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** Newest-first calls in one group per local day: "Today", "Yesterday", then the date. */
export function groupByDay(calls: CallItem[], now: Date = new Date()): CallDay[] {
    const today = dayKey(now)
    const before = new Date(now)
    before.setDate(before.getDate() - 1)
    const yesterday = dayKey(before)
    const days: CallDay[] = []
    for (const call of calls) {
        const date = new Date(call.occurredAt)
        const key = dayKey(date)
        const last = days[days.length - 1]
        if (last?.key === key) {
            last.calls.push(call)
            continue
        }
        const label = key === today ? t('common.today') : key === yesterday ? t('common.yesterday')
            : date.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
        days.push({ key, label, calls: [call] })
    }
    return days
}

/** The call's local time, as a list of one day's calls reads. */
export function timeText(occurredAt: string): string {
    return new Date(occurredAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
}

export function directionText(direction: Direction): string {
    return DIRECTIONS[direction]
}

/** A messaging app's call shows the app: it gives no number, and caller names aren't kept. */
export function numberText(call: Pick<CallItem, 'number' | 'app'>): string {
    if (call.number === undefined) return call.app ?? t('calls.unknown')
    const number = call.number === 'private' ? t('calls.hidden') : call.number
    return call.app ? `${number} (${call.app})` : number
}

/** A call nobody answered has no length to show. */
export function durationText(call: CallItem): string {
    if (call.durationSeconds === 0) return ''
    const minutes = Math.floor(call.durationSeconds / 60)
    const seconds = call.durationSeconds % 60
    if (minutes === 0) return t('common.seconds', { n: seconds })
    return seconds === 0 ? t('common.minutes', { n: minutes }) : t('common.minutesSeconds', { m: minutes, s: seconds })
}
