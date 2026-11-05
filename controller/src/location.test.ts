import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_INTERVAL, MIN_INTERVAL, applyLocation, toDraft, validateDraft } from './location.ts'
import type { Policy } from './policy.ts'

test('a valid draft converts the interval to a number', () => {
    assert.deepEqual(validateDraft({ enabled: true, intervalMinutes: ' 30 ' }), { ok: true, location: { enabled: true, intervalMinutes: 30 } })
    assert.equal(validateDraft({ enabled: false, intervalMinutes: String(MIN_INTERVAL) }).ok, true)
    assert.equal(validateDraft({ enabled: false, intervalMinutes: String(MAX_INTERVAL) }).ok, true)
})

test('the interval must be a whole number within the console limits', () => {
    for (const bad of ['', '4', '0', '-5', '1441', '5.5', 'abc', '1e2', ' ']) {
        assert.equal(validateDraft({ enabled: true, intervalMinutes: bad }).ok, false, `${bad} should be rejected`)
    }
})

test('the interval is validated even when location is turned off, so a bad value is never stored', () => {
    assert.equal(validateDraft({ enabled: false, intervalMinutes: '1' }).ok, false)
})

test('toDraft defaults to 15 minutes when nothing or zero is stored', () => {
    assert.deepEqual(toDraft({ version: 0 }), { enabled: false, intervalMinutes: '15' })
    assert.deepEqual(toDraft({ version: 1, location: { enabled: true } }), { enabled: true, intervalMinutes: '15' })
    assert.deepEqual(toDraft({ version: 1, location: { enabled: true, intervalMinutes: 0 } }), { enabled: true, intervalMinutes: '15' })
    assert.deepEqual(toDraft({ version: 1, location: { enabled: true, intervalMinutes: 20 } }), { enabled: true, intervalMinutes: '20' })
})

test('applyLocation changes only location and keeps unknown sections', () => {
    const policy: Policy = { version: 3, lockSchedule: { enabled: true }, restrictions: { blockSafeBoot: true }, future: { keep: 1 } }
    assert.deepEqual(applyLocation(policy, { enabled: true, intervalMinutes: 10 }), { ...policy, location: { enabled: true, intervalMinutes: 10 } })
})
