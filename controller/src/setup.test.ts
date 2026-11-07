import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SETUP_STEPS, accountTypeName, canFinish, isActive, pairingCode, reconnectChecklist, stepStates, waitingToPair } from './setup.ts'

test('steps before the current one are done, the current one reflects the status, later ones are pending', () => {
    const states = stepStates({ step: 'waiting_for_accounts', status: 'waiting_for_parent' })
    assert.deepEqual(states.map((s) => s.state), ['done', 'done', 'done', 'done', 'waiting', 'pending', 'pending', 'pending', 'pending'])
    assert.equal(stepStates({ step: 'device_owner', status: 'in_progress' })[5].state, 'current')
    assert.equal(stepStates({ step: 'device_owner', status: 'failed' })[5].state, 'failed')
})

test('a finished setup shows every step done', () => {
    assert.ok(stepStates({ step: 'done', status: 'done' }).every((s) => s.state === 'done'))
})

test('an unknown step from a newer phone shows nothing as done rather than guessing', () => {
    assert.ok(stepStates({ step: 'something_new' as never, status: 'in_progress' }).every((s) => s.state === 'pending'))
})

test('the step list matches the server order', () => {
    assert.deepEqual(SETUP_STEPS.map((s) => s.key), [
        'linked', 'pairing', 'checking_accounts', 'removing_app_accounts', 'waiting_for_accounts',
        'device_owner', 'restoring_apps', 'reconnecting', 'done',
    ])
})

test('the reconnect checklist ticks accounts that are back and keeps the original order', () => {
    const list = reconnectChecklist({
        initialAccounts: [
            { type: 'com.google', name: 'kid@example.com' },
            { type: 'com.whatsapp', name: 'WhatsApp' },
            { type: 'com.google', name: 'kid@example.com' },
        ],
        currentAccounts: [{ type: 'com.whatsapp', name: 'WhatsApp' }],
    })
    assert.deepEqual(list.map((a) => [a.name, a.back]), [['kid@example.com', false], ['WhatsApp', true]])
})

test('the same name under a different type is a different account', () => {
    const [only] = reconnectChecklist({
        initialAccounts: [{ type: 'com.google', name: 'kid' }],
        currentAccounts: [{ type: 'com.osp.app.signin', name: 'kid' }],
    })
    assert.equal(only.back, false)
})

test('account types read as names, unknown ones as given', () => {
    assert.equal(accountTypeName('com.google'), 'Google')
    assert.equal(accountTypeName('com.example.app'), 'com.example.app')
})

test('only running or waiting setups are active (the page keeps refreshing for those)', () => {
    assert.equal(isActive({ status: 'in_progress' }), true)
    assert.equal(isActive({ status: 'waiting_for_parent' }), true)
    assert.equal(isActive({ status: 'failed' }), false)
    assert.equal(isActive({ status: 'done' }), false)
})

test('the console offers pairing only while the phone waits for it, with a QR code', () => {
    const qr = 'WIFI:T:ADB;S:manara-ab12;P:pw;;'
    assert.equal(waitingToPair({ step: 'pairing', status: 'waiting_for_parent', pairingQr: qr }), true)
    assert.equal(waitingToPair({ step: 'pairing', status: 'in_progress', pairingQr: qr }), false)
    assert.equal(waitingToPair({ step: 'pairing', status: 'waiting_for_parent' }), false)
    assert.equal(waitingToPair({ step: 'checking_accounts', status: 'waiting_for_parent', pairingQr: qr }), false)
})

test('Finish setup is offered while reconnecting, once', () => {
    assert.equal(canFinish({ step: 'reconnecting', status: 'waiting_for_parent', finishRequested: false }), true)
    assert.equal(canFinish({ step: 'reconnecting', status: 'waiting_for_parent', finishRequested: true }), false)
    assert.equal(canFinish({ step: 'waiting_for_accounts', status: 'waiting_for_parent', finishRequested: false }), false)
})

test('a pairing code is six digits, spaces allowed', () => {
    assert.equal(pairingCode('123456'), '123456')
    assert.equal(pairingCode(' 123 456 '), '123456')
    for (const bad of ['', '12345', '1234567', '12a456', '123-456']) assert.equal(pairingCode(bad), null, bad)
})
