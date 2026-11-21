import { LANGUAGES, chooseLanguage, isLanguage, language, t } from './i18n.ts'
import type { Language } from './i18n.ts'

const SHORT: Record<Language, string> = { en: 'EN', fr: 'FR', ar: 'ع' }

/**
 * English, Français, العربية, as three small buttons. The choice is remembered in this browser and,
 * when signed in, saved on the parent's account ([onChoose]) so the emails Manara sends use it too.
 * The page then reloads. Buttons, not a select: a select changed (and reloaded the page) on the
 * first arrow key, so a keyboard user going to Arabic landed in French (WCAG 3.2.2, audit
 * 2026-11-21).
 */
export function LanguageSwitch({ onChoose }: { onChoose?: (lang: Language) => Promise<unknown> }) {
    const current = language()
    function choose(value: string) {
        if (!isLanguage(value) || value === current) return
        // The page reloads whether or not the server answered: the browser's choice still holds.
        Promise.resolve(onChoose?.(value)).catch(() => undefined).finally(() => chooseLanguage(value))
    }
    return (
        <div class="language" role="group" aria-label={t('language.label')}>
            {LANGUAGES.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    lang={item.key}
                    class={item.key === current ? 'on' : ''}
                    aria-pressed={item.key === current}
                    aria-label={item.name}
                    title={item.name}
                    onClick={() => choose(item.key)}
                >
                    {SHORT[item.key]}
                </button>
            ))}
        </div>
    )
}
