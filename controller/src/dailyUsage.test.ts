import assert from 'node:assert/strict'
import { test } from 'node:test'
import { minutesText, summarizeDailyUsage } from './dailyUsage.ts'
import type { EventItem } from './protection.ts'

let counter = 0
function report(payload: Record<string, unknown> | undefined, occurredAt: string, kind = 'usage_report'): EventItem {
    counter += 1
    return { id: `r${counter}`, kind, occurredAt, ...(payload === undefined ? {} : { payload }) }
}
const app = (name: string, minutes: number) => ({ package: name, minutes })

test('no events means no days', () => {
    assert.deepEqual(summarizeDailyUsage([]), [])
})

test('the latest snapshot of a date wins, whatever the input order', () => {
    const early = report({ date: '2026-11-05', totalMinutes: 10, apps: [app('a', 10)] }, '2026-11-05T08:00:00Z')
    const late = report({ date: '2026-11-05', totalMinutes: 55, apps: [app('a', 40), app('b', 15)] }, '2026-11-05T20:00:00Z')
    for (const events of [[early, late], [late, early]]) {
        const [only, ...rest] = summarizeDailyUsage(events)
        assert.equal(rest.length, 0)
        assert.equal(only.totalMinutes, 55)
        assert.equal(only.reportedAt, '2026-11-05T20:00:00Z')
    }
})

test('days are newest first and capped at 7', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
        report({ date: `2026-11-0${i + 1}`, totalMinutes: i, apps: [] }, `2026-11-0${i + 1}T12:00:00Z`))
    const days = summarizeDailyUsage(events)
    assert.equal(days.length, 7)
    assert.equal(days[0].date, '2026-11-09')
    assert.equal(days[6].date, '2026-11-03')
})

test('apps are busiest first, ties by name, and bad entries are dropped', () => {
    const [day] = summarizeDailyUsage([report({
        date: '2026-11-05', totalMinutes: 70,
        apps: [app('zeta', 5), app('alpha', 5), app('big', 60), { package: '', minutes: 4 }, { package: 'neg', minutes: -1 },
        { package: 'str', minutes: '9' }, null, 'x', { minutes: 3 }, app('  padded  ', 1)],
    }, '2026-11-05T12:00:00Z')])
    assert.deepEqual(day.apps.map((a) => [a.packageName, a.minutes]), [['big', 60], ['alpha', 5], ['zeta', 5], ['padded', 1]])
})

test('other kinds and malformed reports are ignored', () => {
    const events = [
        report({ date: '2026-11-05', totalMinutes: 5, apps: [] }, '2026-11-05T12:00:00Z', 'usage'),
        report(undefined, '2026-11-05T12:00:00Z'),
        report({ date: 'yesterday', totalMinutes: 5, apps: [] }, '2026-11-05T12:00:00Z'),
        report({ date: '2026-11-05', totalMinutes: -1, apps: [] }, '2026-11-05T12:00:00Z'),
        report({ date: '2026-11-05', totalMinutes: Number.NaN, apps: [] }, '2026-11-05T12:00:00Z'),
        report({ date: '2026-11-05', totalMinutes: '5', apps: [] }, '2026-11-05T12:00:00Z'),
        report({ date: '2026-11-05', totalMinutes: 5, apps: [] }, 'not a date'),
    ]
    assert.deepEqual(summarizeDailyUsage(events), [])
})

test('a report whose apps field is not a list still shows its total', () => {
    const [day] = summarizeDailyUsage([report({ date: '2026-11-05', totalMinutes: 12, apps: 'oops' }, '2026-11-05T12:00:00Z')])
    assert.equal(day.totalMinutes, 12)
    assert.deepEqual(day.apps, [])
})

test('only the 30 busiest apps are kept', () => {
    const apps = Array.from({ length: 40 }, (_, i) => app(`app.${i}`, i + 1))
    const [day] = summarizeDailyUsage([report({ date: '2026-11-05', totalMinutes: 1, apps }, '2026-11-05T12:00:00Z')])
    assert.equal(day.apps.length, 30)
    assert.equal(day.apps[0].packageName, 'app.39')
})

test('minutesText reads as minutes under an hour and hours and minutes above', () => {
    assert.equal(minutesText(0), '0 min')
    assert.equal(minutesText(59), '59 min')
    assert.equal(minutesText(60), '1 h 00 min')
    assert.equal(minutesText(125), '2 h 05 min')
    assert.equal(minutesText(59.6), '1 h 00 min')
})
