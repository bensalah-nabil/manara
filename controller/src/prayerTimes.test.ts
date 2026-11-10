import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRAYERS, clock, lastPlace, prayerSeries, prayerTimes } from './prayerTimes.ts'
import type { EventItem } from './protection.ts'

const tunis = { lat: 36.8065, lng: 10.1815 }
const near = (actual: number | undefined, expected: string, what: string) => {
    assert.ok(actual !== undefined, what)
    const [h, m] = expected.split(':').map(Number)
    assert.ok(Math.abs(actual - (h * 60 + m)) <= 1, `${what}: expected about ${expected}, got ${clock(actual)}`)
}

// The same reference values as the phone's PrayerTimesTest (PrayTimes.org 2.3.2, 18 degrees), so
// the console and the phone show the same minute.
test('Tunis in November matches the reference', () => {
    const t = prayerTimes(2026, 11, 10, tunis, 60)
    near(t.fajr, '05:23', 'Fajr')
    near(t.dhuhr, '12:03', 'Dhuhr')
    near(t.asr, '14:53', 'Asr')
    near(t.maghrib, '17:14', 'Maghrib')
    near(t.isha, '18:43', 'Isha')
})

test('Tunis on the longest day matches the reference', () => {
    const t = prayerTimes(2026, 6, 21, tunis, 60)
    near(t.fajr, '03:08', 'Fajr')
    near(t.asr, '16:13', 'Asr')
    near(t.isha, '21:34', 'Isha')
})

test('Tunis in February exercises the year roll-back', () => {
    const t = prayerTimes(2027, 2, 10, tunis, 60)
    near(t.fajr, '05:46', 'Fajr')
    near(t.maghrib, '17:54', 'Maghrib')
})

test('prayers come in order through the day', () => {
    const t = prayerTimes(2026, 11, 10, tunis, 60)
    const order = PRAYERS.map((p) => t[p]!)
    assert.deepEqual([...order].sort((a, b) => a - b), order)
})

test('a series has one entry per day, with dates that cross months', () => {
    const series = prayerSeries(new Date(2026, 10, 28), 5, tunis, () => 60)
    assert.deepEqual(series.map((d) => d.date), ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    assert.ok(series.every((d) => PRAYERS.every((p) => d.times[p] !== undefined)))
})

test('the phone place is its newest fix, rounded to about a kilometre', () => {
    const events = [
        { id: '1', kind: 'location', occurredAt: '2026-11-09T10:00:00Z', payload: { lat: 36.8, lng: 10.18 } },
        { id: '2', kind: 'location', occurredAt: '2026-11-10T10:00:00Z', payload: { lat: 34.7406, lng: 10.7603 } },
        { id: '3', kind: 'location', occurredAt: '2026-11-11T10:00:00Z', payload: { lat: 'x' } },
    ] as unknown as EventItem[]
    assert.deepEqual(lastPlace(events), { lat: 34.74, lng: 10.76, at: '2026-11-10T10:00:00Z' })
    assert.equal(lastPlace([]), null)
})

test('clock reads minutes as HH:MM', () => {
    assert.equal(clock(5 * 60 + 3), '05:03')
    assert.equal(clock(24 * 60 + 5), '00:05')
})
