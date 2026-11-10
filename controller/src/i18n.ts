import { ar } from './messages/ar.ts'
import { en } from './messages/en.ts'
import type { MessageKey } from './messages/en.ts'
import { fr } from './messages/fr.ts'

export type { MessageKey }
export type Language = 'en' | 'fr' | 'ar'

export const LANGUAGES: { key: Language; name: string }[] = [
    { key: 'en', name: 'English' },
    { key: 'fr', name: 'Français' },
    { key: 'ar', name: 'العربية' },
]

const CATALOGUES: Record<Language, Record<MessageKey, string>> = { en, fr, ar }
const STORAGE_KEY = 'manara.language'

export function isLanguage(value: unknown): value is Language {
    return value === 'en' || value === 'fr' || value === 'ar'
}

/** A browser's language tag ("ar-TN", "fr") as one of ours, or null. */
export function fromTag(tag: string | undefined | null): Language | null {
    const short = (tag ?? '').toLowerCase().split('-')[0]
    return isLanguage(short) ? short : null
}

/** What the parent chose in this browser, or null if they never chose. */
export function storedLanguage(): Language | null {
    try {
        if (typeof window === 'undefined') return null
        const stored = window.localStorage.getItem(STORAGE_KEY)
        return isLanguage(stored) ? stored : null
    } catch {
        return null // storage blocked: fall back to the browser's language
    }
}

/**
 * The stored choice, else the browser's language, else English. Outside a browser (the unit
 * tests) it is always English, whatever the machine's own language.
 */
function initialLanguage(): Language {
    if (typeof window === 'undefined') return 'en'
    return storedLanguage() ?? fromTag(window.navigator?.language) ?? 'en'
}

let current: Language = initialLanguage()

export function language(): Language {
    return current
}

/** Arabic reads right to left. */
export function direction(lang: Language = current): 'ltr' | 'rtl' {
    return lang === 'ar' ? 'rtl' : 'ltr'
}

/**
 * The locale dates and times are written in. English keeps the browser's own; Arabic uses
 * Tunisia's, which writes Western digits (2026, not ٢٠٢٦).
 */
export function dateLocale(lang: Language = current): string | undefined {
    return lang === 'ar' ? 'ar-TN' : lang === 'fr' ? 'fr' : undefined
}

/** For tests, and for the page before it reloads. Text already built keeps its language. */
export function setLanguage(lang: Language): void {
    current = lang
}

/** Sets `lang` and `dir` on the page, and its title. */
export function applyToDocument(): void {
    if (typeof document === 'undefined') return
    document.documentElement.lang = current
    document.documentElement.dir = direction()
    document.title = t('app.title')
}

/**
 * The parent's choice: remembered in this browser, then the page reloads, because lists of
 * wording built when the page loaded are in the old language.
 */
export function chooseLanguage(lang: Language): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
        // Storage blocked: the choice lasts until the page is closed.
    }
    if (lang === current) return
    current = lang
    window.location.reload()
}

/**
 * What to do with the language once the parent's account is known. A choice made in this browser
 * wins and is saved to the account; a browser with no choice yet takes the account's.
 */
export function languageSync(stored: Language | null, shown: Language, account: string): { adopt?: Language; save?: Language } {
    if (stored !== null) return stored === account ? {} : { save: stored }
    if (isLanguage(account) && account !== 'en') return account === shown ? {} : { adopt: account }
    // The account still has the default: keep what the browser showed, and remember it.
    return shown === account ? {} : { save: shown }
}

function fill(text: string, params?: Record<string, string | number>): string {
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** The message in the current language; English if a translation is somehow empty. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
    return fill(CATALOGUES[current][key] || en[key], params)
}

/** The message in a given language, whatever the current one. */
export function tIn(lang: Language, key: MessageKey, params?: Record<string, string | number>): string {
    return fill(CATALOGUES[lang][key] || en[key], params)
}

type PluralBase = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey]

/** `base.one` for exactly one, `base.other` otherwise, with `{n}` filled in. */
export function tn(base: PluralBase, n: number, params?: Record<string, string | number>): string {
    return t(`${base}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n, ...params })
}

/** Joins a list the way the language does ("a, b" or "a، b"). */
export function joinList(items: string[]): string {
    return items.join(t('common.listSeparator'))
}
