import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COLORS, MAX_NAME, checkName, colorHex, initial } from './profile.ts'

test('every color matches the server list, and an unknown one falls back to neutral', () => {
    assert.deepEqual(COLORS.map((c) => c.key), ['teal', 'blue', 'purple', 'pink', 'red', 'orange', 'amber', 'green'])
    assert.equal(colorHex('pink'), '#be185d')
    assert.equal(colorHex(undefined), colorHex('nope'))
})

test('the initial is the first letter, in any script', () => {
    assert.equal(initial('sara'), 'S')
    assert.equal(initial('  عائشة'), 'ع')
    assert.equal(initial('Samsung SM-A045F'), 'S')
    assert.equal(initial('  '), '?')
    assert.equal(initial('🙂 Adam'), 'A')
})

test('a name is trimmed and counted in letters', () => {
    assert.deepEqual(checkName('  Sara '), { name: 'Sara' })
    assert.deepEqual(checkName('é'.repeat(MAX_NAME)), { name: 'é'.repeat(MAX_NAME) })
    assert.ok('error' in checkName('a'.repeat(MAX_NAME + 1)))
})
