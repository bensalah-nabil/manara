import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import type { EventItem } from './protection.ts'

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
    "This sends the number, direction, time and length of each call on this phone from now on, never what was said. Your child sees this on the phone's notice and status screen. The other person in each call is not told, and the law on this differs by country. Save anyway?"

export type Direction = 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked'

export interface CallItem {
    id: string
    number: string
    direction: Direction
    occurredAt: string
    durationSeconds: number
}

const DIRECTIONS: Record<Direction, string> = {
    incoming: 'Incoming',
    outgoing: 'Outgoing',
    missed: 'Missed',
    rejected: 'Rejected',
    blocked: 'Blocked',
}

export const MAX_SHOWN = 100

/** Newest first. A malformed report is left out rather than shown as a call that didn't happen. */
export function summarizeCalls(events: EventItem[]): CallItem[] {
    const calls: CallItem[] = []
    for (const event of events) {
        if (event.kind !== 'call' || Number.isNaN(Date.parse(event.occurredAt))) continue
        const payload = (event.payload ?? {}) as { number?: unknown; direction?: unknown; durationSeconds?: unknown }
        if (typeof payload.number !== 'string' || typeof payload.direction !== 'string' || !(payload.direction in DIRECTIONS)) continue
        const duration = typeof payload.durationSeconds === 'number' && payload.durationSeconds > 0 ? payload.durationSeconds : 0
        calls.push({ id: event.id, number: payload.number, direction: payload.direction as Direction, occurredAt: event.occurredAt, durationSeconds: duration })
    }
    return calls.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, MAX_SHOWN)
}

export function directionText(direction: Direction): string {
    return DIRECTIONS[direction]
}

export function numberText(number: string): string {
    return number === 'private' ? 'Hidden number' : number
}

/** A call nobody answered has no length to show. */
export function durationText(call: CallItem): string {
    if (call.durationSeconds === 0) return ''
    const minutes = Math.floor(call.durationSeconds / 60)
    const seconds = call.durationSeconds % 60
    if (minutes === 0) return `${seconds} s`
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
}
