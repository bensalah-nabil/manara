import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    aboveUsual, appName, applySuggestion, dailySeries, findInsights, hourGrid, lateNights, median, parseReports, suggestionText,
} from './insights.ts'
import type { EventItem } from './protection.ts'

const utc = (ms: number) => { const d = new Date(ms); return { weekday: d.getUTCDay(), hour: d.getUTCHours() } }

let id = 0
function report(at: string, total: number, apps: Record<string, number> = {}): EventItem {
    return {
        id: String(++id), kind: 'usage_report', occurredAt: at,
        payload: { date: at.slice(0, 10), totalMinutes: total, apps: Object.entries(apps).map(([pkg, minutes]) => ({ package: pkg, minutes })) },
    }
}

/** [days] days ending 2026-11-08, one end-of-day report each, [perDay] minutes of [pkg]. */
function history(days: number, pkg: string, perDay: number, extra: Record<string, number> = {}): EventItem[] {
    return Array.from({ length: days }, (_, i) => {
        const date = new Date(Date.parse('2026-11-08T00:00:00Z') - (days - i) * 86400000).toISOString().slice(0, 10)
        return report(`${date}T20:00:00Z`, perDay, { [pkg]: perDay, ...extra })
    })
}

test('reports are parsed, bad ones skipped, oldest first', () => {
    const reports = parseReports([
        report('2026-11-08T10:00:00Z', 30, { 'com.whatsapp': 30 }),
        report('2026-11-07T10:00:00Z', 20),
        { id: 'x', kind: 'usage_report', occurredAt: 'nope', payload: { date: '2026-11-08', totalMinutes: 5 } },
        { id: 'y', kind: 'usage_report', occurredAt: '2026-11-08T11:00:00Z', payload: { date: 'bad', totalMinutes: 5 } },
        { id: 'z', kind: 'lock', occurredAt: '2026-11-08T11:00:00Z', payload: {} },
    ])
    assert.deepEqual(reports.map((r) => r.date), ['2026-11-07', '2026-11-08'])
    assert.equal(reports[1].apps.get('com.whatsapp'), 30)
})

test('the daily series keeps the last report of each date and marks missing days', () => {
    const reports = parseReports([
        report('2026-11-08T09:00:00Z', 10), report('2026-11-08T21:00:00Z', 95), report('2026-11-06T21:00:00Z', 40),
    ])
    assert.deepEqual(dailySeries(reports, '2026-11-08', 3), [
        { date: '2026-11-06', minutes: 40 }, { date: '2026-11-07', minutes: null }, { date: '2026-11-08', minutes: 95 },
    ])
})

test('median, and "well above usual" needs both 50% and 30 minutes, over 5 days', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 2, 3]), 2.5)
    assert.equal(median([]), null)
    assert.ok(aboveUsual(120, 60, 7))
    assert.ok(!aboveUsual(80, 60, 7), 'only 20 minutes over')
    assert.ok(aboveUsual(40, 10, 7), '4x and exactly 30 minutes over: both met')
    assert.ok(!aboveUsual(39, 10, 7), '29 minutes over is not enough')
    assert.ok(!aboveUsual(200, 60, 4), 'too few days to say')
})

test('the hour grid places each increase in the hour it arrived', () => {
    const reports = parseReports([
        report('2026-11-08T08:00:00Z', 10), // first of the day: can't be placed
        report('2026-11-08T09:00:00Z', 40), // +30 at 09
        report('2026-11-08T23:00:00Z', 70), // +30 at 23
    ])
    const grid = hourGrid(reports, utc)
    const sunday = 0 // 2026-11-08 is a Sunday
    assert.equal(grid.minutes[sunday][9], 30)
    assert.equal(grid.minutes[sunday][23], 30)
    assert.equal(grid.minutes[sunday][8], 0)
    assert.equal(grid.days[sunday], 1)
})

test('late nights count evenings with 10+ minutes between 22:00 and 06:00, after midnight going to the evening before', () => {
    const reports = parseReports([
        report('2026-11-05T21:00:00Z', 50), report('2026-11-05T23:00:00Z', 80), // night of the 5th: +30
        report('2026-11-07T00:30:00Z', 5), report('2026-11-07T01:30:00Z', 25), // night of the 6th: +20 at 01
        report('2026-11-07T21:00:00Z', 40), report('2026-11-07T22:30:00Z', 44), // +4: too little
    ])
    const nights = lateNights(reports, Date.parse('2026-11-08T12:00:00Z'), 7, 10, utc)
    assert.equal(nights.count, 2)
    assert.equal(nights.latestHour, 1)
})

test('a spike in one app is found, with a limit suggested near its usual', () => {
    const events = [...history(10, 'com.zhiliaoapp.musically', 30), report('2026-11-08T18:00:00Z', 110, { 'com.zhiliaoapp.musically': 110 })]
    const insights = findInsights({ reports: parseReports(events), limitHits: [], policy: { version: 1 }, today: '2026-11-08', now: Date.parse('2026-11-08T19:00:00Z'), hourOf: utc })
    const spike = insights.find((i) => i.id === 'spike:com.zhiliaoapp.musically')
    assert.ok(spike, JSON.stringify(insights))
    assert.match(spike.title, /^TikTok: 1 h 50 min today/)
    assert.deepEqual(spike.suggestion, { kind: 'limit', packageName: 'com.zhiliaoapp.musically', minutes: 30 })
})

test('an app that already has a limit gets no second one suggested', () => {
    const events = [...history(10, 'com.roblox.client', 20), report('2026-11-08T18:00:00Z', 90, { 'com.roblox.client': 90 })]
    const policy = { version: 3, timeLimits: { enabled: true, rules: [{ category: 'Games', packages: ['com.roblox.client'], dailyMinutes: 60 }] } }
    const spike = findInsights({ reports: parseReports(events), limitHits: [], policy, today: '2026-11-08', now: Date.parse('2026-11-08T19:00:00Z'), hourOf: utc })
        .find((i) => i.id === 'spike:com.roblox.client')
    assert.ok(spike)
    assert.equal(spike.suggestion, undefined)
    assert.match(spike.detail, /already has a 1 h 00 min daily limit/)
})

test('a new app with real use is found; occasional use is not', () => {
    const events = [
        ...history(8, 'com.whatsapp', 20),
        report('2026-11-07T20:00:00Z', 60, { 'com.whatsapp': 20, 'com.roblox.client': 40 }),
        report('2026-11-08T20:00:00Z', 70, { 'com.whatsapp': 20, 'com.roblox.client': 45, 'com.calc': 5 }),
    ]
    const insights = findInsights({ reports: parseReports(events), limitHits: [], policy: null, today: '2026-11-08', now: Date.parse('2026-11-08T21:00:00Z'), hourOf: utc })
    assert.ok(insights.some((i) => i.id === 'new:com.roblox.client'))
    assert.ok(!insights.some((i) => i.id === 'spike:com.roblox.client'), 'one card per app')
    assert.ok(!insights.some((i) => i.id === 'new:com.calc'))
})

test('late nights suggest a night lock, unless one is set', () => {
    const nights = ['2026-11-04', '2026-11-05', '2026-11-06'].flatMap((d) => [report(`${d}T21:00:00Z`, 40), report(`${d}T23:30:00Z`, 70)])
    const input = { reports: parseReports(nights), limitHits: [], today: '2026-11-08', now: Date.parse('2026-11-08T12:00:00Z'), hourOf: utc }
    const plain = findInsights({ ...input, policy: null }).find((i) => i.id === 'late-nights')
    assert.deepEqual(plain?.suggestion, { kind: 'bedtime', fromHour: 22, toHour: 7 })
    const locked = findInsights({ ...input, policy: { version: 2, lockSchedule: { enabled: true, windows: [{ days: [1], fromHour: 21, toHour: 7 }] } } })
        .find((i) => i.id === 'late-nights')
    assert.equal(locked?.suggestion, undefined)
})

test('a limit reached on 5 of 7 days is pointed out, without a rule', () => {
    const hits = ['02', '03', '04', '05', '07'].map((d) => ({ category: 'Games', occurredAt: `2026-11-${d}T15:00:00Z` }))
    const insight = findInsights({ reports: [], limitHits: hits, policy: null, today: '2026-11-08', now: Date.parse('2026-11-08T12:00:00Z') })
        .find((i) => i.id === 'limit:Games')
    assert.ok(insight)
    assert.equal(insight.suggestion, undefined)
})

test('rising screen time week over week', () => {
    const events = [...history(14, 'com.whatsapp', 60).slice(0, 7), ...history(7, 'com.whatsapp', 120)]
    const rising = findInsights({ reports: parseReports(events), limitHits: [], policy: null, today: '2026-11-08', now: Date.parse('2026-11-08T12:00:00Z'), hourOf: utc })
        .find((i) => i.id === 'rising')
    assert.ok(rising)
    // Last week (Oct 26 to Nov 1) averages 69 min a day, this week 120.
    assert.match(rising.title, /up 75%/)
})

test('a suggestion adds its rule and keeps everything else', () => {
    const policy = { version: 4, timeLimits: { enabled: false, rules: [{ category: 'Games', packages: ['a.b'], dailyMinutes: 60 }] }, future: 1 }
    const withLimit = applySuggestion(policy, { kind: 'limit', packageName: 'com.zhiliaoapp.musically', minutes: 30 })
    assert.deepEqual(withLimit.timeLimits, {
        enabled: true,
        rules: [{ category: 'Games', packages: ['a.b'], dailyMinutes: 60 }, { category: 'TikTok', packages: ['com.zhiliaoapp.musically'], dailyMinutes: 30 }],
    })
    assert.equal(withLimit.future, 1)
    const withLock = applySuggestion({ version: 4 }, { kind: 'bedtime', fromHour: 22, toHour: 7 })
    assert.deepEqual(withLock.lockSchedule, { enabled: true, windows: [{ days: [1, 2, 3, 4, 5, 6, 7], fromHour: 22, toHour: 7 }] })
    assert.match(suggestionText({ kind: 'bedtime', fromHour: 22, toHour: 7 }), /22:00 to 07:00/)
})

test('app names: known ones, else the package\'s last part', () => {
    assert.equal(appName('com.zhiliaoapp.musically'), 'TikTok')
    assert.equal(appName('com.example.coolgame'), 'Coolgame')
})
