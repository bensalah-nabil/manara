import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agoText, authErrorText, errorText, lastSeenText, statusText } from './format.ts'
import { ApiError } from './api.ts'

test('errorText reports a missing device specifically and everything else generically', () => {
    assert.equal(errorText(new ApiError(404, 'not_found', '')), 'That device no longer exists.')
    assert.match(errorText(new ApiError(0, 'network', '')), /Cannot reach the server/)
    assert.equal(errorText(new Error('boom')), 'Something went wrong. Please try again.')
    assert.equal(errorText('weird'), 'Something went wrong. Please try again.')
})

test('status text covers the contract values and tolerates unknown ones', () => {
    assert.equal(statusText('reporting'), 'Reporting')
    assert.equal(statusText('not_reporting'), 'Not reporting')
    assert.equal(statusText('never_connected'), 'Never connected')
    assert.equal(statusText('something_new'), 'Unknown')
})

test('a zero or invalid timestamp is shown as never, not as year 1', () => {
    assert.equal(lastSeenText('0001-01-01T00:00:00Z'), 'Never')
    assert.equal(lastSeenText('not a date'), 'Never')
    assert.notEqual(lastSeenText('2026-11-05T10:00:00Z', 'en-GB'), 'Never')
})

test('auth errors give generic, non-leaking messages', () => {
    assert.equal(authErrorText('invalid_credentials'), 'Incorrect email or password.')
    assert.equal(authErrorText('email_taken'), 'That email is already registered.')
    assert.match(authErrorText('network'), /Cannot reach the server/)
    assert.equal(authErrorText('internal'), 'Something went wrong. Please try again.')
})

test('agoText is relative for recent times and a date after two days', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    assert.equal(agoText('2026-11-07T11:59:40Z', now), 'just now')
    assert.equal(agoText('2026-11-07T11:55:00Z', now), '5 min ago')
    assert.equal(agoText('2026-11-07T09:00:00Z', now), '3 h ago')
    assert.equal(agoText('2026-11-06T06:00:00Z', now), 'yesterday')
    assert.equal(agoText('2026-11-01T12:00:00Z', now, 'en-GB'), '01/11/2026')
    assert.equal(agoText('0001-01-01T00:00:00Z', now), 'never')
})
