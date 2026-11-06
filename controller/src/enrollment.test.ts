import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    ATTESTATION_VERSION,
    PHONE_GUIDES,
    PREPARE_ITEMS,
    STATEMENTS,
    attestationComplete,
    guideFor,
    noAttestation,
    nothingPrepared,
    preparedComplete,
} from './enrollment.ts'

test('every statement must be confirmed', () => {
    const attestation = noAttestation()
    assert.equal(attestationComplete(attestation), false)
    for (const { key } of STATEMENTS) {
        attestation[key] = true
    }
    assert.equal(attestationComplete(attestation), true)
    for (const { key } of STATEMENTS) {
        assert.equal(attestationComplete({ ...attestation, [key]: false }), false, `${key} alone unchecked must block`)
    }
})

test('the version is a date, matching the server constant format', () => {
    assert.match(ATTESTATION_VERSION, /^\d{4}-\d{2}-\d{2}$/)
})

test('brands match the server list, and only Samsung is marked tested', () => {
    // Keep in step with domain.PhoneBrands in backend/internal/domain/parent.go.
    assert.deepEqual(PHONE_GUIDES.map((g) => g.brand).sort(), ['google', 'motorola', 'oneplus', 'oppo-realme', 'other', 'samsung', 'xiaomi'])
    assert.deepEqual(PHONE_GUIDES.filter((g) => g.tested).map((g) => g.brand), ['samsung'])
})

test('every guide turns on wireless debugging and ends with the Settings search fallback', () => {
    for (const guide of PHONE_GUIDES) {
        assert.ok(guide.developerOptions.length >= 3, guide.brand)
        assert.ok(guide.developerOptions.some((step) => step.includes('Wireless debugging')), guide.brand)
        assert.ok(guide.developerOptions.at(-1)?.includes('search'), guide.brand)
    }
    assert.equal(guideFor('samsung')?.name, 'Samsung')
    assert.equal(guideFor('nokia'), undefined)
})

test('setup cannot continue until every preparation item is ticked', () => {
    const prepared = nothingPrepared()
    assert.equal(preparedComplete(prepared), false)
    for (const { key } of PREPARE_ITEMS) prepared[key] = true
    assert.equal(preparedComplete(prepared), true)
    assert.equal(preparedComplete({ ...prepared, passwordsNoted: false }), false)
})

test('the preparation list warns about passwords and chat backups, and needs no cable', () => {
    const text = PREPARE_ITEMS.map((item) => item.text).join(' ')
    assert.match(text, /never sees or stores passwords/)
    assert.match(text, /WhatsApp/)
    assert.doesNotMatch(text, /USB/)
})
