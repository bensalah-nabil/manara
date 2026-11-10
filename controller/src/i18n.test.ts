import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateLocale, direction, fromTag, joinList, language, languageSync, setLanguage, t, tIn, tn } from './i18n.ts'
import { ar } from './messages/ar.ts'
import { en } from './messages/en.ts'
import type { MessageKey } from './messages/en.ts'
import { fr } from './messages/fr.ts'

const keys = Object.keys(en) as MessageKey[]
const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const bold = (text: string) => (text.match(/<\/?b>/g) ?? []).join('')

test('outside a browser the console is in English, whatever the machine speaks', () => {
    assert.equal(language(), 'en')
    assert.equal(t('auth.signIn'), 'Sign in')
})

test('French and Arabic have every message, none empty', () => {
    for (const [name, catalogue] of [['fr', fr], ['ar', ar]] as const) {
        assert.deepEqual(Object.keys(catalogue).sort(), [...keys].sort(), name)
        for (const key of keys) assert.ok(catalogue[key].trim() !== '' || en[key].trim() === '', `${name} ${key}`)
    }
})

test('a translation fills in the same names and keeps the same bold parts', () => {
    for (const [name, catalogue] of [['fr', fr], ['ar', ar]] as const) {
        for (const key of keys) {
            assert.deepEqual(params(catalogue[key]), params(en[key]), `${name} ${key}`)
            assert.equal(bold(catalogue[key]), bold(en[key]), `${name} ${key}`)
        }
    }
})

test('Arabic messages are written in Arabic', () => {
    // Brand and product names stay in Latin letters; a message with no Arabic letter at all is a miss.
    const latinOnly = new Set<MessageKey>(['chromeEditor.title', 'setup.accountLine'])
    for (const key of keys) {
        if (latinOnly.has(key) || !/[A-Za-z]{3}/.test(en[key])) continue
        assert.match(ar[key], /[؀-ۿ]/, key)
    }
})

test('names are filled in, and an unknown name is left visible', () => {
    assert.equal(t('time.minAgo', { n: 5 }), '5 min ago')
    assert.equal(t('time.minAgo'), '{n} min ago')
    assert.equal(tIn('fr', 'time.minAgo', { n: 5 }), 'il y a 5 min')
})

test('one and many', () => {
    assert.match(tn('account.phonesLeft', 1), /^One phone is still/)
    assert.match(tn('account.phonesLeft', 3), /^3 phones are still/)
})

test('switching language changes the wording, the direction and the date locale', () => {
    try {
        setLanguage('ar')
        assert.equal(direction(), 'rtl')
        assert.equal(dateLocale(), 'ar-TN')
        assert.equal(t('auth.signIn'), 'تسجيل الدخول')
        assert.equal(joinList(['a', 'b']), 'a، b')
        setLanguage('fr')
        assert.equal(direction(), 'ltr')
        assert.equal(t('auth.signIn'), 'Se connecter')
    } finally {
        setLanguage('en')
    }
    assert.equal(dateLocale(), undefined)
})

test('Arabic dates use Western digits, as Tunisia writes them', () => {
    const text = new Date(Date.UTC(2026, 10, 10, 12)).toLocaleDateString(dateLocale('ar'))
    assert.match(text, /2026/)
    assert.doesNotMatch(text, /[٠-٩]/)
})

test("a browser's language tag maps to one of ours", () => {
    assert.equal(fromTag('ar-TN'), 'ar')
    assert.equal(fromTag('fr'), 'fr')
    assert.equal(fromTag('FR-fr'), 'fr')
    assert.equal(fromTag('de-DE'), null)
    assert.equal(fromTag(undefined), null)
})

test('the browser and the account settle on one language', () => {
    // A choice made in this browser wins and is saved.
    assert.deepEqual(languageSync('ar', 'ar', 'en'), { save: 'ar' })
    assert.deepEqual(languageSync('ar', 'ar', 'ar'), {})
    // No choice here yet: take the account's.
    assert.deepEqual(languageSync(null, 'en', 'ar'), { adopt: 'ar' })
    assert.deepEqual(languageSync(null, 'ar', 'ar'), {})
    // The account is still on the default: remember what this browser shows.
    assert.deepEqual(languageSync(null, 'fr', 'en'), { save: 'fr' })
    assert.deepEqual(languageSync(null, 'en', 'en'), {})
    // An account value this console doesn't know is ignored.
    assert.deepEqual(languageSync(null, 'en', 'de'), { save: 'en' })
})
