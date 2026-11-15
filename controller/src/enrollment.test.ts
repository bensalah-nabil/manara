import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    ATTESTATION_VERSION,
    PHONE_GUIDES,
    STATEMENTS,
    accountsText,
    attestationComplete,
    guideFor,
    noAttestation,
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

test('Samsung parents hear before changing anything that the Google account is removed for a moment', () => {
    const samsung = guideFor('samsung')!
    assert.match(accountsText(samsung), /removed for a moment/)
    assert.match(accountsText(samsung), /No app is uninstalled/)
})

test('stock Android expects only a pause, untested brands are told to be ready', () => {
    const pixel = guideFor('google')!
    assert.match(accountsText(pixel), /no account is removed/)
    assert.match(accountsText(pixel), /not been tested/)
})

test('every picture is a file in public/guide-img, with a description', async () => {
    const { existsSync } = await import('node:fs')
    for (const guide of PHONE_GUIDES) {
        for (const picture of guide.pictures ?? []) {
            assert.ok(existsSync(new URL(`../public${picture.src}`, import.meta.url)), picture.src)
            assert.ok(picture.alt.length > 10 && picture.caption.length > 5, picture.src)
        }
    }
})
