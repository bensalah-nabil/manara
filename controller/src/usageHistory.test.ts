import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EventItem } from './protection.ts'
import { limitHitText, summarizeLimitHits } from './usageHistory.ts'

let counter = 0
function hit(category: unknown, dailyMinutes: unknown, occurredAt: string, kind = 'usage'): EventItem {
    counter += 1
    return { id: `u${counter}`, kind, occurredAt, payload: { category, dailyMinutes } }
}

test('no events means no history', () => {
    assert.deepEqual(summarizeLimitHits([]), [])
})

test('newest first, whatever the input order', () => {
    const events = [
        hit('social', 30, '2026-11-05T08:00:00Z'),
        hit('games', 60, '2026-11-05T10:00:00Z'),
        hit('social', 30, '2026-11-04T09:00:00Z'),
    ]
    const expected = ['2026-11-05T10:00:00Z', '2026-11-05T08:00:00Z', '2026-11-04T09:00:00Z']
    assert.deepEqual(summarizeLimitHits(events).map((h) => h.occurredAt), expected)
    assert.deepEqual(summarizeLimitHits([...events].reverse()).map((h) => h.occurredAt), expected)
})

test('other kinds and malformed usage reports are ignored, not shown as nonsense', () => {
    const events = [
        hit('social', 30, '2026-11-05T08:00:00Z', 'enforcement'),
        hit('', 30, '2026-11-05T08:00:00Z'),
        hit('   ', 30, '2026-11-05T08:00:00Z'),
        hit(7, 30, '2026-11-05T08:00:00Z'),
        hit('social', '30', '2026-11-05T08:00:00Z'),
        hit('social', -5, '2026-11-05T08:00:00Z'),
        hit('social', Number.NaN, '2026-11-05T08:00:00Z'),
        hit('social', 30, 'not a date'),
        { id: 'x', kind: 'usage', occurredAt: '2026-11-05T08:00:00Z' },
    ]
    assert.deepEqual(summarizeLimitHits(events), [])
})

test('keeps only the 20 newest', () => {
    const events = Array.from({ length: 25 }, (_, i) => hit('social', 30, new Date(Date.UTC(2026, 10, 5, 0, i)).toISOString()))
    const hits = summarizeLimitHits(events)
    assert.equal(hits.length, 20)
    assert.equal(hits[0].occurredAt, '2026-11-05T00:24:00.000Z')
    assert.equal(hits[19].occurredAt, '2026-11-05T00:05:00.000Z')
})

test('wording: a zero limit reads as blocked, not as a zero-minute limit reached', () => {
    const [zero] = summarizeLimitHits([hit('social', 0, '2026-11-05T08:00:00Z')])
    const [some] = summarizeLimitHits([hit(' games ', 45, '2026-11-05T08:00:00Z')])
    assert.equal(limitHitText(zero), 'social: blocked (limit is 0 minutes a day)')
    assert.equal(limitHitText(some), 'games: reached the 45-minute daily limit')
})
