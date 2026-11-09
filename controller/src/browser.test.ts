import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_SITES, applyBrowser, normalizeSite, secureDnsNote, toDraft, validateDraft } from './browser.ts'

test('absent or malformed means Chrome is left alone', () => {
    assert.deepEqual(toDraft({ version: 1 }), { safeSearch: false, youtube: 'off', secureDnsOff: false, sitesText: '', blockOtherBrowsers: false })
    assert.deepEqual(toDraft({ version: 1, browser: { safeSearch: 'yes', youtube: 'lenient', blockedSites: 'x' } }), {
        safeSearch: false, youtube: 'off', secureDnsOff: false, sitesText: '', blockOtherBrowsers: false,
    })
})

test('a stored policy reads back into the draft', () => {
    const draft = toDraft({ version: 2, browser: { safeSearch: true, youtube: 'strict', secureDnsOff: true, blockedSites: ['a.example', 'b.example'], blockOtherBrowsers: true } })
    assert.deepEqual(draft, { safeSearch: true, youtube: 'strict', secureDnsOff: true, sitesText: 'a.example\nb.example', blockOtherBrowsers: true })
})

test('sites are cleaned: scheme, case, trailing slash, blanks and repeats', () => {
    assert.equal(normalizeSite('  HTTPS://www.Example.com/ '), 'www.example.com')
    const result = validateDraft({ safeSearch: false, youtube: 'off', secureDnsOff: false, sitesText: 'example.com\n\nhttps://example.com/\r\nbad.example/path', blockOtherBrowsers: false })
    assert.ok(result.ok)
    assert.deepEqual(result.browser.blockedSites, ['example.com', 'bad.example/path'])
})

test('a line with a space, or too many sites, is refused', () => {
    const spaced = validateDraft({ safeSearch: false, youtube: 'off', secureDnsOff: false, sitesText: 'not a site', blockOtherBrowsers: false })
    assert.ok(!spaced.ok && spaced.errors[0].includes('not a site'))
    const many = Array.from({ length: MAX_SITES + 1 }, (_, i) => `s${i}.example`).join('\n')
    assert.ok(!validateDraft({ safeSearch: false, youtube: 'off', secureDnsOff: false, sitesText: many, blockOtherBrowsers: false }).ok)
})

test('saving keeps fields this console does not know', () => {
    const policy = { version: 3, browser: { future: 1 }, lock: {} }
    const saved = applyBrowser(policy, { safeSearch: true, youtube: 'moderate', secureDnsOff: false, blockedSites: [], blockOtherBrowsers: true })
    assert.deepEqual(saved, { version: 3, lock: {}, browser: { future: 1, safeSearch: true, youtube: 'moderate', secureDnsOff: false, blockedSites: [], blockOtherBrowsers: true } })
})

test('the secure DNS note depends on site filtering', () => {
    assert.match(secureDnsNote(true), /Recommended/)
    assert.match(secureDnsNote(false), /Only useful/)
})
