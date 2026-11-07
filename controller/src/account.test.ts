import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DELETE_WORD, canDelete, phonesLeftText, resetToken } from './account.ts'

const TOKEN = 'a'.repeat(64)

test('a reset link is read from the hash, and nothing else is', () => {
    assert.equal(resetToken(`#reset=${TOKEN}`), TOKEN)
    assert.equal(resetToken(`reset=${TOKEN}`), TOKEN)
    assert.equal(resetToken('#reset=short'), null)
    assert.equal(resetToken(`#phone/${TOKEN}`), null)
    assert.equal(resetToken(`#reset=${TOKEN}&x=1`), null)
    assert.equal(resetToken(''), null)
})

test('deleting needs no phones, the password, and the word', () => {
    assert.ok(canDelete(0, 'pw', DELETE_WORD))
    assert.ok(canDelete(0, 'pw', ` ${DELETE_WORD} `))
    assert.ok(!canDelete(1, 'pw', DELETE_WORD))
    assert.ok(!canDelete(0, '', DELETE_WORD))
    assert.ok(!canDelete(0, 'pw', 'delete'))
})

test('the phones-left text counts', () => {
    assert.match(phonesLeftText(1), /^One phone/)
    assert.match(phonesLeftText(3), /^3 phones/)
})
