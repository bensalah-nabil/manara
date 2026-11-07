/** The colors a parent can pick for a child's phone; the names match domain.DeviceColors on the server. */
export const COLORS: { key: string; name: string; hex: string }[] = [
    { key: 'teal', name: 'Teal', hex: '#0f766e' },
    { key: 'blue', name: 'Blue', hex: '#1d4ed8' },
    { key: 'purple', name: 'Purple', hex: '#7c3aed' },
    { key: 'pink', name: 'Pink', hex: '#be185d' },
    { key: 'red', name: 'Red', hex: '#b91c1c' },
    { key: 'orange', name: 'Orange', hex: '#c2410c' },
    { key: 'amber', name: 'Amber', hex: '#a16207' },
    { key: 'green', name: 'Green', hex: '#15803d' },
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
    if ([...trimmed].length > MAX_NAME) return { error: `Up to ${MAX_NAME} letters.` }
    return { name: trimmed }
}
