import assert from 'node:assert/strict'
import { test } from 'node:test'
import { savedText } from './usePolicyEditor.ts'

test('a save says seconds only when a push woke the phone', () => {
    assert.match(savedText(3, true), /version 3\. The phone applies it in a few seconds\./)
    assert.match(savedText(3, false), /next check-in, within about 15 minutes/)
})
