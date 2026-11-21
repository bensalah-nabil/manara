import assert from 'node:assert/strict'
import test from 'node:test'
import { agoText, phoneProblem, tokens, usd } from './model.ts'
import type { Phone } from './api.ts'

const now = Date.parse('2026-11-19T12:00:00Z')
const phone = (fields: Partial<Phone>): Phone => ({
    id: 'p', accountId: 'a', accountEmail: 'parent@example.com', manufacturer: 'samsung', model: 'Galaxy A04e',
    androidVersion: '14', agentVersion: '1.0.34', createdAt: '2026-11-01T00:00:00Z', ...fields,
})

test('a phone that checked in recently has no problem', () => {
    assert.equal(phoneProblem(phone({ lastSeen: '2026-11-19T11:00:00Z', setupStatus: 'done' }), now), null)
})

test('a phone quiet for more than a day is not reporting', () => {
    assert.equal(phoneProblem(phone({ lastSeen: '2026-11-18T10:00:00Z' }), now), 'silent')
})

test('Go zero time and a missing time both mean never', () => {
    assert.equal(phoneProblem(phone({ lastSeen: '0001-01-01T00:00:00Z' }), now), 'never_seen')
    assert.equal(phoneProblem(phone({}), now), 'never_seen')
    assert.equal(agoText('0001-01-01T00:00:00Z', now), 'never')
})

test('a failed setup comes first, a setup quiet for two hours is stuck', () => {
    assert.equal(phoneProblem(phone({ lastSeen: '2026-11-19T11:59:00Z', setupStatus: 'failed' }), now), 'setup_failed')
    assert.equal(phoneProblem(phone({ lastSeen: '2026-11-19T11:59:00Z', setupStatus: 'waiting_for_parent', setupUpdatedAt: '2026-11-19T09:00:00Z' }), now), 'setup_stuck')
    assert.equal(phoneProblem(phone({ lastSeen: '2026-11-19T11:59:00Z', setupStatus: 'in_progress', setupUpdatedAt: '2026-11-19T11:30:00Z' }), now), null)
})

test('ago text', () => {
    assert.equal(agoText('2026-11-19T11:55:00Z', now), '5 min ago')
    assert.equal(agoText('2026-11-19T06:00:00Z', now), '6 h ago')
    assert.equal(agoText('2026-11-10T12:00:00Z', now), '9 days ago')
})

test('days are summed into weeks starting on Monday', async () => {
    const { weekly } = await import('./model.ts')
    const weeks = weekly([
        { date: '2026-11-15', newAccounts: 1, newPhones: 0 }, // Sunday
        { date: '2026-11-16', newAccounts: 2, newPhones: 1 }, // Monday
        { date: '2026-11-20', newAccounts: 1, newPhones: 3 }, // Friday
    ])
    assert.deepEqual(weeks, [
        { week: '2026-11-09', newAccounts: 1, newPhones: 0 },
        { week: '2026-11-16', newAccounts: 3, newPhones: 4 },
    ])
})

test('axis tops are round numbers', async () => {
    const { niceMax, share } = await import('./model.ts')
    assert.deepEqual([0, 1, 3, 7, 12, 48, 230].map(niceMax), [1, 1, 5, 10, 20, 50, 500])
    assert.equal(share(1, 4), '25%')
    assert.equal(share(1, 0), '–')
})

test('money and token counts read at a glance', () => {
    assert.equal(usd(0), '$0')
    assert.equal(usd(0.00042), '$0.0004')
    assert.equal(usd(0.0123), '$0.01')
    assert.equal(usd(2.5), '$2.50')
    assert.equal(tokens(950), '950')
    assert.equal(tokens(12_345), '12k')
    assert.equal(tokens(4_100), '4.1k')
    assert.equal(tokens(4_100_000), '4.1M')
})
