import type { CallItem } from './callLog.ts'
import type { Policy } from './policy.ts'
import { t } from './i18n.ts'

/**
 * Calls from numbers the parent doesn't know (roadmap W2). The parent types the numbers they know;
 * Manara never reads the child's contacts. The server compares and alerts, and never sends this
 * list to the child's phone. The matching here mirrors the server's `domain.NumberKey`.
 */
export interface Draft {
    enabled: boolean
    numbersText: string
}

export const MAX_KNOWN = 100
const KEY_DIGITS = 8

/** The last 8 digits, or '' for a number too short to compare (a service code, a hidden number). */
export function numberKey(number: string | undefined): string {
    const digits = (number ?? '').replace(/\D/g, '')
    if (digits.length < 6) return ''
    return digits.slice(-KEY_DIGITS)
}

function section(policy: Policy): { enabled?: unknown; knownNumbers?: unknown } {
    const value = policy.callAlerts
    return typeof value === 'object' && value !== null ? (value as { enabled?: unknown; knownNumbers?: unknown }) : {}
}

export function knownNumbers(policy: Policy): string[] {
    const list = section(policy).knownNumbers
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : []
}

export function alertsOn(policy: Policy): boolean {
    return section(policy).enabled === true
}

export function toDraft(policy: Policy): Draft {
    return { enabled: alertsOn(policy), numbersText: knownNumbers(policy).join('\n') }
}

export type Validation = { ok: true; value: { enabled: boolean; knownNumbers: string[] } } | { ok: false; errors: string[] }

export function validateDraft(draft: Draft): Validation {
    const lines = draft.numbersText.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    const errors: string[] = []
    for (const line of lines) {
        if (line.length > 30 || numberKey(line) === '' || /[^\d+\-(). ]/.test(line)) errors.push(t('callAlerts.badNumber', { number: line }))
    }
    if (lines.length > MAX_KNOWN) errors.push(t('callAlerts.tooMany', { n: MAX_KNOWN }))
    if (draft.enabled && lines.length === 0) errors.push(t('callAlerts.needOne'))
    if (errors.length > 0) return { ok: false, errors }
    // One entry per number, whatever way it was written.
    const seen = new Set<string>()
    const unique = lines.filter((line) => {
        const key = numberKey(line)
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
    return { ok: true, value: { enabled: draft.enabled, knownNumbers: unique } }
}

export function applyCallAlerts(policy: Policy, value: { enabled: boolean; knownNumbers: string[] }): Policy {
    return { ...policy, callAlerts: { enabled: value.enabled, knownNumbers: value.knownNumbers } }
}

/** A call to the child from a number not on the list; a hidden number counts. App calls have no number. */
export function isUnknownCaller(call: CallItem, known: string[]): boolean {
    if (call.app || !['incoming', 'missed', 'rejected'].includes(call.direction)) return false
    const key = numberKey(call.number)
    if (key === '') return true
    return !known.some((number) => numberKey(number) === key)
}
