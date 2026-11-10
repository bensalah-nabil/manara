import { LANGUAGES, chooseLanguage, isLanguage, language, t } from './i18n.ts'
import type { Language } from './i18n.ts'

/**
 * English, Français, العربية. The choice is remembered in this browser and, when signed in, saved
 * on the parent's account ([onChoose]) so the emails Manara sends use it too. The page then reloads.
 */
export function LanguageSwitch({ onChoose }: { onChoose?: (lang: Language) => Promise<unknown> }) {
    function choose(value: string) {
        if (!isLanguage(value)) return
        // The page reloads whether or not the server answered: the browser's choice still holds.
        Promise.resolve(onChoose?.(value)).catch(() => undefined).finally(() => chooseLanguage(value))
    }
    return (
        <label class="language">
            <select value={language()} aria-label={t('language.label')} onChange={(event) => choose(event.currentTarget.value)}>
                {LANGUAGES.map((item) => <option key={item.key} value={item.key} lang={item.key}>{item.name}</option>)}
            </select>
        </label>
    )
}
