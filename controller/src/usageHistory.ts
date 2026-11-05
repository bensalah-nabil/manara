import type { EventItem } from './protection.ts'

export interface LimitHit {
    id: string
    category: string
    dailyMinutes: number
    occurredAt: string
}

const MAX_HITS = 20

/** Newest first. Reads only the phone's `usage` reports of a rule's limit being reached. */
export function summarizeLimitHits(events: EventItem[]): LimitHit[] {
    const hits: LimitHit[] = []
    for (const event of events) {
        if (event.kind !== 'usage') continue
        const category = event.payload?.category
        const dailyMinutes = event.payload?.dailyMinutes
        if (typeof category !== 'string' || category.trim() === '') continue
        if (typeof dailyMinutes !== 'number' || !Number.isFinite(dailyMinutes) || dailyMinutes < 0) continue
        if (Number.isNaN(Date.parse(event.occurredAt))) continue
        hits.push({ id: event.id, category: category.trim(), dailyMinutes, occurredAt: event.occurredAt })
    }
    hits.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    return hits.slice(0, MAX_HITS)
}

export function limitHitText(hit: LimitHit): string {
    return hit.dailyMinutes === 0
        ? `${hit.category}: blocked (limit is 0 minutes a day)`
        : `${hit.category}: reached the ${hit.dailyMinutes}-minute daily limit`
}
