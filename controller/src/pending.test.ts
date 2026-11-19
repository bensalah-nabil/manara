import assert from 'node:assert/strict'
import test from 'node:test'
import { delayLabel, loosensText, onPendingChanged, pendingChanged, remainingText } from './pending.ts'

const now = Date.parse('2026-11-20T12:00:00Z')

test('the time left reads in minutes, hours, then days', () => {
    assert.equal(remainingText('2026-11-20T12:30:00Z', now), 'in 30 min')
    assert.equal(remainingText('2026-11-21T11:05:00Z', now), 'in 23 h 5 min')
    assert.equal(remainingText('2026-11-27T12:00:00Z', now), 'in 7 days')
})

test('a change whose time has come lands any minute', () => {
    assert.equal(remainingText('2026-11-20T11:00:00Z', now), 'any minute')
    assert.equal(remainingText('not a date', now), 'any minute')
})

test('what a change loosens reads in plain words, and an unknown code still shows', () => {
    assert.equal(loosensText(['site_filter', 'sites']), 'the website filter is turned off or blocks less; blocked websites are unblocked')
    assert.equal(loosensText(['something_new']), 'something_new')
})

test('each delay choice has a name', () => {
    assert.equal(delayLabel(0), 'Off')
    assert.equal(delayLabel(1), '1 hour')
    assert.equal(delayLabel(24), '24 hours')
    assert.equal(delayLabel(48), '2 days')
    assert.equal(delayLabel(168), '7 days')
})

test('listeners hear a change until they stop listening', () => {
    let heard = 0
    const stop = onPendingChanged(() => { heard++ })
    pendingChanged()
    stop()
    pendingChanged()
    assert.equal(heard, 1)
})

test('the wait is read, set and removed without touching the rest of the policy', async () => {
    const { delayHours, withDelay } = await import('./pending.ts')
    const policy = { version: 3, siteFilter: { enabled: true } }
    assert.equal(delayHours(policy), 0)
    const delayed = withDelay(policy, 24)
    assert.deepEqual(delayed, { version: 3, siteFilter: { enabled: true }, changeDelay: { hours: 24 } })
    assert.equal(delayHours(delayed), 24)
    assert.deepEqual(withDelay(delayed, 0), policy)
})
