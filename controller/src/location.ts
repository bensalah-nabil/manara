import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'

export interface LocationPolicy {
    enabled: boolean
    intervalMinutes?: number
}

export interface Draft {
    enabled: boolean
    intervalMinutes: string
}

export type ValidationResult = { ok: true; location: LocationPolicy } | { ok: false; errors: string[] }

/** Console-side guard only: the backend does not enforce it. Shorter intervals drain the battery. */
export const MIN_INTERVAL = 5
export const MAX_INTERVAL = 1440
const DEFAULT_INTERVAL = 15

export function toDraft(policy: Policy): Draft {
    const location = policy.location as LocationPolicy | undefined
    return {
        enabled: location?.enabled ?? false,
        intervalMinutes: String(location?.intervalMinutes || DEFAULT_INTERVAL),
    }
}

export function validateDraft(draft: Draft): ValidationResult {
    const text = draft.intervalMinutes.trim()
    const minutes = Number(text)
    if (!/^\d+$/.test(text) || minutes < MIN_INTERVAL || minutes > MAX_INTERVAL) {
        return { ok: false, errors: [`Minutes between updates must be a whole number from ${MIN_INTERVAL} to ${MAX_INTERVAL}.`] }
    }
    return { ok: true, location: { enabled: draft.enabled, intervalMinutes: minutes } }
}

export function applyLocation(policy: Policy, location: LocationPolicy): Policy {
    return withSection(policy, 'location', location)
}
