import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCallLog, directionText, durationText, MAX_SHOWN, numberText, summarizeCalls, toDraft } from './callLog.ts'
import type { EventItem } from './protection.ts'

function call(id: string, occurredAt: string, payload: unknown, kind = 'call'): EventItem {
    return { id, kind, occurredAt, payload } as EventItem
}

test('off unless the policy says on, and other sections are kept', () => {
    assert.deepEqual(toDraft({ version: 1 }), { enabled: false })
    assert.deepEqual(toDraft({ version: 1, callLog: { enabled: true } }), { enabled: true })
    assert.deepEqual(applyCallLog({ version: 2, location: {} }, { enabled: true }), { version: 2, location: {}, callLog: { enabled: true } })
})

test('calls come newest first', () => {
    const calls = summarizeCalls([
        call('a', '2026-11-09T08:00:00Z', { number: '+1', direction: 'incoming', durationSeconds: 5 }),
        call('b', '2026-11-09T09:00:00Z', { number: '+2', direction: 'outgoing', durationSeconds: 65 }),
    ])
    assert.deepEqual(calls.map((item) => item.id), ['b', 'a'])
})

test('a malformed report or another kind of event is left out', () => {
    const calls = summarizeCalls([
        call('kind', '2026-11-09T08:00:00Z', { number: '+1', direction: 'incoming' }, 'usage'),
        call('date', 'nope', { number: '+1', direction: 'incoming' }),
        call('number', '2026-11-09T08:00:00Z', { direction: 'incoming' }),
        call('direction', '2026-11-09T08:00:00Z', { number: '+1', direction: 'sideways' }),
        call('proto', '2026-11-09T08:00:00Z', { number: '+1', direction: 'constructor' }),
    ])
    assert.equal(calls.filter((item) => item.id !== 'proto').length, 0)
})

test('the list is capped', () => {
    const many = Array.from({ length: MAX_SHOWN + 5 }, (_, i) => call(String(i), '2026-11-09T08:00:00Z', { number: '+1', direction: 'missed' }))
    assert.equal(summarizeCalls(many).length, MAX_SHOWN)
})

test('calls read plainly', () => {
    assert.equal(directionText('missed'), 'Missed')
    assert.equal(numberText('private'), 'Hidden number')
    assert.equal(numberText('+21699'), '+21699')
    const item = { id: 'x', number: '+1', direction: 'incoming' as const, occurredAt: '', durationSeconds: 0 }
    assert.equal(durationText(item), '')
    assert.equal(durationText({ ...item, durationSeconds: 42 }), '42 s')
    assert.equal(durationText({ ...item, durationSeconds: 120 }), '2 min')
    assert.equal(durationText({ ...item, durationSeconds: 125 }), '2 min 5 s')
})
