import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HISTORY_TURNS, failureKey, helpRequest, looksPrivate, suggestions } from './setupHelp.ts'
import { en } from './messages/en.ts'

test('codes, phone numbers and emails are flagged; ordinary numbers are not', () => {
    for (const text of ['the code is 482913', 'call +216 98 123 456', 'me@example.com', '48-29-13', '192.168.1.15:42277']) {
        assert.ok(looksPrivate(text), text)
    }
    for (const text of ['Android 14', 'about 15 minutes', 'step 3 of 9', 'battery 50%', 'since 2026']) {
        assert.ok(!looksPrivate(text), text)
    }
})

test('a request carries only the last turns, the context and the trimmed question', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'parent', text: `t${i}` }) as const)
    const req = helpRequest('  what now?  ', turns, { step: 'pairing', status: 'in_progress', maker: 'samsung', language: 'fr' })
    assert.equal(req.question, 'what now?')
    assert.equal(req.history.length, HISTORY_TURNS)
    assert.equal(req.history.at(-1)?.text, 't9')
    assert.equal(req.step, 'pairing')
    assert.equal(req.maker, 'samsung')
})

test('every suggestion and failure message exists in the catalogue', () => {
    const steps = ['add_phone', 'before', 'linked', 'pairing', 'checking_accounts', 'waiting_for_accounts', 'removing_app_accounts', 'device_owner', 'restoring_apps', 'reconnecting', 'done']
    for (const step of steps) {
        for (const key of [...suggestions(step, 'in_progress'), ...suggestions(step, 'failed')]) assert.ok(key in en, key)
    }
    for (const [code, status] of [['', 429], ['assistant_declined', 422], ['assistant_unavailable', 503], ['network', 0], ['x', 502]] as const) {
        assert.ok(failureKey(code, status) in en)
    }
})
