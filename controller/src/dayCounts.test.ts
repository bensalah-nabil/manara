import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_SHOWN as MAX_CHANGES, parseAppChanges, summarizeAppChanges } from './appChanges.ts'
import type { AppChangeItem } from './appChanges.ts'
import { MAX_SHOWN as MAX_CALLS, parseCalls, summarizeCalls } from './callLog.ts'
import type { CallItem } from './callLog.ts'
import { appChangesPerDay, callsPerDay, lastDates, localDate } from './dayCounts.ts'
import type { EventItem } from './protection.ts'

// Local times, so the tests hold in any time zone the machine is in.
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()
const now = new Date(2026, 10, 20, 15)

const call = (id: string, occurredAt: string, direction: CallItem['direction'], number?: string, app?: string): CallItem =>
    ({ id, occurredAt, direction, number, app, durationSeconds: 0 })

test('the days end today, oldest first, one per calendar day', () => {
    assert.deepEqual(lastDates(now, 3), ['2026-11-18', '2026-11-19', '2026-11-20'])
    assert.equal(lastDates(now, 30).length, 30)
    assert.equal(lastDates(now, 30)[0], '2026-10-22')
    assert.equal(localDate(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05')
})

test('with call alerts on, calls from numbers the parent does not know are the main part', () => {
    const calls = [
        call('1', at(20, 9), 'incoming', '+216 98 765 432'), // known
        call('2', at(20, 11), 'missed', '22 111 333'), // unknown
        call('3', at(20, 12), 'incoming'), // hidden number: unknown
        call('4', at(19), 'outgoing', '22 111 333'), // the child called out: not an unknown caller
        call('5', at(19), 'incoming', undefined, 'WhatsApp'), // an app call has no number
        call('6', new Date(2026, 9, 1, 10).toISOString(), 'incoming', '22 111 333'), // older than 30 days: not shown
    ]
    const days = callsPerDay(calls, ['98765432'], now)
    assert.equal(days.length, 30)
    assert.deepEqual(days.at(-1), { date: '2026-11-20', main: 2, context: 1 })
    assert.deepEqual(days.at(-2), { date: '2026-11-19', main: 0, context: 2 })
    assert.equal(days.reduce((n, d) => n + d.main + d.context, 0), 5)
})

test('with call alerts off, every call is the main part and nothing is grey', () => {
    const days = callsPerDay([call('1', at(20), 'incoming', '22 111 333'), call('2', at(20), 'outgoing', '98 765 432')], null, now, 7)
    assert.deepEqual(days.at(-1), { date: '2026-11-20', main: 2, context: 0 })
})

test('installs are the main part, removals the rest', () => {
    const item = (id: string, occurredAt: string, action: AppChangeItem['action']): AppChangeItem =>
        ({ id, occurredAt, action, packageName: 'org.example.app', label: 'App' })
    const days = appChangesPerDay([item('a', at(20), 'installed'), item('b', at(20), 'installed'), item('c', at(18), 'removed')], now, 7)
    assert.deepEqual(days.at(-1), { date: '2026-11-20', main: 2, context: 0 })
    assert.deepEqual(days.at(-3), { date: '2026-11-18', main: 0, context: 1 })
})

test('the lists stop at their limit, the charts count every event', () => {
    const calls: EventItem[] = Array.from({ length: MAX_CALLS + 20 }, (_, i) =>
        ({ id: `c${i}`, kind: 'call', occurredAt: at(20), payload: { number: `2211${i}`, direction: 'incoming' } }))
    assert.equal(summarizeCalls(calls).length, MAX_CALLS)
    assert.equal(parseCalls(calls).length, MAX_CALLS + 20)
    const changes: EventItem[] = Array.from({ length: MAX_CHANGES + 5 }, (_, i) =>
        ({ id: `a${i}`, kind: 'app_change', occurredAt: at(20), payload: { action: 'installed', package: `org.example.app${i}` } }))
    assert.equal(summarizeAppChanges(changes).length, MAX_CHANGES)
    assert.equal(parseAppChanges(changes).length, MAX_CHANGES + 5)
})
