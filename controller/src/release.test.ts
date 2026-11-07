import assert from 'node:assert/strict'
import { test } from 'node:test'
import { minutesLeft, releaseCodeText } from './release.ts'

test('an 8-digit code reads as two groups of four', () => {
    assert.equal(releaseCodeText('12345678'), '1234 5678')
    assert.equal(releaseCodeText('123'), '123')
})

test('minutesLeft counts down whole minutes and ends at 0', () => {
    const now = Date.parse('2026-11-07T10:00:00Z')
    assert.equal(minutesLeft('2026-11-07T10:09:30Z', now), 9)
    assert.equal(minutesLeft('2026-11-07T10:00:20Z', now), 1)
    assert.equal(minutesLeft('2026-11-07T09:59:00Z', now), 0)
    assert.equal(minutesLeft('garbage', now), 0)
})
