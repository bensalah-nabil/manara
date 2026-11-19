import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activityText } from './activity.ts'

const names = (id: string) => (id === 'dev-1' ? "Sara's phone" : undefined)
const at = '2026-11-18T21:00:00Z'

test('a command names what was sent and to which phone', () => {
    assert.equal(activityText({ action: 'command_sent', deviceId: 'dev-1', detail: 'lock_now', at }, names), "Lock now sent to Sara's phone")
    assert.equal(activityText({ action: 'command_sent', deviceId: 'dev-1', detail: 'something_new', at }, names), "Command sent to Sara's phone")
})

test("a removed phone's entries stay readable", () => {
    assert.equal(activityText({ action: 'phone_removed', deviceId: 'dev-gone', at }, names),
        'Manara removed from a removed phone, or the phone removed from the list')
    assert.equal(activityText({ action: 'rules_changed', deviceId: 'dev-gone', at }, names), 'Rules changed on a removed phone')
})

test('sign-ins say whether two-step sign-in was used', () => {
    assert.equal(activityText({ action: 'signed_in', detail: 'password', at }, names), 'Signed in with the password')
    assert.equal(activityText({ action: 'signed_in', detail: 'two_step', at }, names), 'Signed in with two-step sign-in')
})

test('an action this console does not know yet still shows a line', () => {
    assert.equal(activityText({ action: 'from_the_future', at }, names), 'Other action')
})
