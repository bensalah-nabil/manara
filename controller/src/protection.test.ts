import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeProtection } from './protection.ts'
import type { EventItem } from './protection.ts'

let counter = 0
function report(enforcer: string, status: string, detail: string | undefined, occurredAt: string, kind = 'enforcement'): EventItem {
    counter += 1
    return { id: `e${counter}`, kind, occurredAt, payload: { enforcer, status, ...(detail === undefined ? {} : { detail }) } }
}

test('no events means no reports', () => {
    assert.deepEqual(summarizeProtection([]), [])
})

test('the newest report for a protection wins, so a restored problem is cleared', () => {
    const events = [
        report('time-limit', 'missing', 'usage_access', '2026-11-05T08:00:00Z'),
        report('time-limit', 'restored', 'usage_access', '2026-11-05T09:00:00Z'),
    ]
    const [only, ...rest] = summarizeProtection(events)
    assert.equal(rest.length, 0)
    assert.equal(only.state, 'restored')
    assert.equal(only.reportedAt, '2026-11-05T09:00:00Z')
    assert.equal(only.title, 'App time limits')
})

test('event order in the input does not matter', () => {
    const events = [
        report('time-limit', 'restored', 'usage_access', '2026-11-05T09:00:00Z'),
        report('time-limit', 'missing', 'usage_access', '2026-11-05T08:00:00Z'),
    ]
    assert.equal(summarizeProtection(events)[0].state, 'restored')
    assert.equal(summarizeProtection([...events].reverse())[0].state, 'restored')
})

test('a problem that breaks again after being restored needs attention again', () => {
    const events = [
        report('location', 'missing', 'device_location_on', '2026-11-05T07:00:00Z'),
        report('location', 'restored', 'device_location_on', '2026-11-05T08:00:00Z'),
        report('location', 'missing', 'device_location_on', '2026-11-05T09:00:00Z'),
    ]
    const [only] = summarizeProtection(events)
    assert.equal(only.state, 'attention')
    assert.equal(only.detail, "The phone's Location setting is off.")
})

test('different details stay separate, and unresolved problems are listed first', () => {
    const events = [
        report('location', 'restored', 'device_location_on', '2026-11-05T12:00:00Z'),
        report('restrictions', 'missing', 'disallow_config_private_dns', '2026-11-05T08:00:00Z'),
        report('site-filter', 'failed', 'dns host rejected', '2026-11-05T10:00:00Z'),
    ]
    const reports = summarizeProtection(events)
    assert.deepEqual(reports.map((r) => [r.title, r.state]), [
        ['Site filtering', 'attention'],
        ['Settings restrictions', 'attention'],
        ['Location sharing', 'restored'],
    ])
    assert.equal(reports[1].detail, 'Private DNS settings are no longer locked.')
})

test('a rejected filtering host is explained, with other codes still shown as reported', () => {
    const [rejected] = summarizeProtection([report('site-filter', 'failed', 'host_not_serving', '2026-11-05T08:00:00Z')])
    assert.equal(rejected.title, 'Site filtering')
    assert.match(rejected.detail, /could not use the filtering host/)
    const [failed] = summarizeProtection([report('site-filter', 'failed', 'failure_setting', '2026-11-05T08:00:00Z')])
    assert.match(failed.detail, /could not apply the filtering host/)
    const [other] = summarizeProtection([report('site-filter', 'failed', 'code_7', '2026-11-05T08:00:00Z')])
    assert.equal(other.detail, 'code_7')
})

test('unknown details and protections are shown as reported, never hidden', () => {
    const [free] = summarizeProtection([report('site-filter', 'failed', 'SecurityException', '2026-11-05T08:00:00Z')])
    assert.equal(free.detail, 'SecurityException')
    const [unknown] = summarizeProtection([report('future-thing', 'missing', undefined, '2026-11-05T08:00:00Z')])
    assert.equal(unknown.title, 'future-thing')
    assert.equal(unknown.detail, 'A problem was reported.')
})

test('events of other kinds, unknown statuses, and bad timestamps are ignored', () => {
    const events = [
        report('location', 'missing', 'x', '2026-11-05T08:00:00Z', 'location'),
        report('location', 'weird', 'x', '2026-11-05T08:00:00Z'),
        report('location', 'missing', 'x', 'not a time'),
        { id: 'p', kind: 'enforcement', occurredAt: '2026-11-05T08:00:00Z' },
    ]
    assert.deepEqual(summarizeProtection(events), [])
})
