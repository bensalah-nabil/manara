import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCallAlerts, isUnknownCaller, numberKey, toDraft, validateDraft } from './callAlerts.ts'
import type { CallItem } from './callLog.ts'

const call = (fields: Partial<CallItem>): CallItem => ({ id: 'c', direction: 'incoming', occurredAt: '2026-11-20T10:00:00Z', durationSeconds: 30, ...fields })

test('numbers match whatever their prefix, like the server', () => {
    for (const n of ['+216 22 123 456', '0021622123456', '22123456', '22-123-456', '(+216) 22.123.456']) assert.equal(numberKey(n), '22123456')
    for (const n of ['', 'private', '85', '*123#', undefined]) assert.equal(numberKey(n), '')
})

test('a stranger or a hidden number calling the child is unknown; the child calling out or an app call is not', () => {
    const known = ['+216 22 123 456']
    assert.equal(isUnknownCaller(call({ number: '22123456' }), known), false)
    assert.equal(isUnknownCaller(call({ number: '98765432' }), known), true)
    assert.equal(isUnknownCaller(call({ number: '98765432', direction: 'missed' }), known), true)
    assert.equal(isUnknownCaller(call({ number: 'private' }), known), true)
    assert.equal(isUnknownCaller(call({ number: '98765432', direction: 'outgoing' }), known), false)
    assert.equal(isUnknownCaller(call({ app: 'WhatsApp' }), known), false)
})

test('the list is read and written without touching the rest of the policy', () => {
    assert.deepEqual(toDraft({ version: 1 }), { enabled: false, numbersText: '' })
    const policy = applyCallAlerts({ version: 2, location: { enabled: true } }, { enabled: true, knownNumbers: ['22123456'] })
    assert.deepEqual(policy, { version: 2, location: { enabled: true }, callAlerts: { enabled: true, knownNumbers: ['22123456'] } })
    assert.deepEqual(toDraft(policy), { enabled: true, numbersText: '22123456' })
})

test('blank lines go, a number written twice is kept once, a wrong line is named', () => {
    const ok = validateDraft({ enabled: true, numbersText: ' +216 22 123 456 \n\n22123456\n71 123 456' })
    assert.deepEqual(ok, { ok: true, value: { enabled: true, knownNumbers: ['+216 22 123 456', '71 123 456'] } })
    const bad = validateDraft({ enabled: true, numbersText: 'mum\n12' })
    assert.equal(bad.ok, false)
    if (!bad.ok) assert.equal(bad.errors.length, 2)
})

test('alerts on need at least one known number, or every call would alert', () => {
    assert.equal(validateDraft({ enabled: true, numbersText: '' }).ok, false)
    assert.equal(validateDraft({ enabled: false, numbersText: '' }).ok, true)
})
