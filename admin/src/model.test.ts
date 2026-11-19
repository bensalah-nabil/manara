import assert from 'node:assert/strict'
import test from 'node:test'
import { agoText, phoneProblem } from './model.ts'
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
