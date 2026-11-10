import { t } from './i18n.ts'
/** The colors a parent can pick for a child's phone; the names match domain.DeviceColors on the server. */
export const COLORS: { key: string; name: string; hex: string }[] = [
    { key: 'teal', name: t('color.teal'), hex: '#0f766e' },
    { key: 'blue', name: t('color.blue'), hex: '#1d4ed8' },
    { key: 'purple', name: t('color.purple'), hex: '#7c3aed' },
    { key: 'pink', name: t('color.pink'), hex: '#be185d' },
    { key: 'red', name: t('color.red'), hex: '#b91c1c' },
    { key: 'orange', name: t('color.orange'), hex: '#c2410c' },
    { key: 'amber', name: t('color.amber'), hex: '#a16207' },
    { key: 'green', name: t('color.green'), hex: '#15803d' },
]

/** Neutral until the parent picks a color. Dark enough for white text, like every color above. */
const NO_COLOR = '#5b6b77'

export const MAX_NAME = 40

export function colorHex(key: string | undefined): string {
    return COLORS.find((c) => c.key === key)?.hex ?? NO_COLOR
}

/** The first letter of the name, whatever the script; '?' with no letter at all. */
export function initial(name: string): string {
    for (const char of name.trim()) {
        if (/\p{L}|\p{N}/u.test(char)) return char.toLocaleUpperCase()
    }
    return '?'
}

/** The trimmed name, or an error to show; counts letters, not bytes, like the server. */
export function checkName(name: string): { name: string } | { error: string } {
    const trimmed = name.trim()
    if ([...trimmed].length > MAX_NAME) return { error: t('profile.tooLong', { n: MAX_NAME }) }
    return { name: trimmed }
}
