import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'

export interface TimeLimitRule {
    category: string
    packages: string[]
    dailyMinutes: number
}

export interface TimeLimits {
    enabled: boolean
    rules?: TimeLimitRule[]
}

export interface RuleDraft {
    category: string
    packages: string
    dailyMinutes: string
}

export interface Draft {
    enabled: boolean
    rules: RuleDraft[]
}

export type ValidationResult = { ok: true; timeLimits: TimeLimits } | { ok: false; errors: string[] }

const MAX_MINUTES = 1440
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/

export function toDraft(policy: Policy): Draft {
    const limits = policy.timeLimits as TimeLimits | undefined
    return {
        enabled: limits?.enabled ?? false,
        rules: (limits?.rules ?? []).map((rule) => ({
            category: rule.category,
            packages: rule.packages.join('\n'),
            dailyMinutes: String(rule.dailyMinutes),
        })),
    }
}

export function emptyRule(): RuleDraft {
    return { category: '', packages: '', dailyMinutes: '60' }
}

/** TikTok, Facebook and Instagram, with their Lite and regional versions; a listed app the phone doesn't have is ignored. */
export const SOCIAL_MEDIA_PACKAGES = [
    'com.zhiliaoapp.musically',
    'com.ss.android.ugc.trill',
    'com.zhiliaoapp.musically.go',
    'com.tiktok.lite.go',
    'com.facebook.katana',
    'com.facebook.lite',
    'com.instagram.android',
    'com.instagram.lite',
]

export function socialMediaRule(): RuleDraft {
    return { category: 'Social media', packages: SOCIAL_MEDIA_PACKAGES.join('\n'), dailyMinutes: '60' }
}

export function parsePackages(text: string): string[] {
    const seen = new Set<string>()
    for (const part of text.split(/[\s,]+/)) {
        if (part) seen.add(part)
    }
    return [...seen]
}

export function validateDraft(draft: Draft): ValidationResult {
    const errors: string[] = []
    const rules: TimeLimitRule[] = []
    const categories = new Set<string>()

    draft.rules.forEach((rule, index) => {
        const label = `Rule ${index + 1}`
        const category = rule.category.trim()
        if (category === '') errors.push(`${label}: enter a name.`)
        else if (categories.has(category)) errors.push(`${label}: the name "${category}" is already used.`)
        categories.add(category)

        const packages = parsePackages(rule.packages)
        if (packages.length === 0) errors.push(`${label}: add at least one app package name.`)
        for (const name of packages) {
            if (!PACKAGE_NAME.test(name)) errors.push(`${label}: "${name}" is not a valid package name.`)
        }

        const minutesText = rule.dailyMinutes.trim()
        const minutes = Number(minutesText)
        if (!/^\d+$/.test(minutesText) || minutes > MAX_MINUTES) {
            errors.push(`${label}: minutes must be a whole number from 0 to ${MAX_MINUTES}.`)
        }

        rules.push({ category, packages, dailyMinutes: minutes })
    })

    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, timeLimits: { enabled: draft.enabled, rules } }
}

export function applyTimeLimits(policy: Policy, timeLimits: TimeLimits): Policy {
    return withSection(policy, 'timeLimits', timeLimits)
}

/** A limit of zero blocks the apps immediately, so the editor says so before saving. */
export function blocksImmediately(draft: Draft): boolean {
    return draft.enabled && draft.rules.some((rule) => rule.dailyMinutes.trim() === '0')
}
