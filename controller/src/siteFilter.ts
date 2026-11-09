import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'

export interface SiteFilter {
    enabled: boolean
    dnsHost?: string
}

export interface Draft {
    enabled: boolean
    dnsHost: string
}

export type ValidationResult = { ok: true; filter: SiteFilter } | { ok: false; errors: string[] }

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

// Deliberately stricter than Android, whose own check (NetworkUtilsInternal.isWeaklyValidatedHostname, AOSP main)
// accepts [a-zA-Z0-9_.-] and rejects only IP literals. This console also requires a dotted name without underscores.

/** DNS names are case-insensitive, and the agent compares the host as an exact string, so store one canonical form. */
export function normalizeHost(text: string): string {
    return text.trim().toLowerCase().replace(/\.$/, '')
}

/** Blocks adult sites and turns on safe search for the whole phone (AdGuard DNS, family protection). */
export const FAMILY_FILTER_HOST = 'family.adguard-dns.com'

export function toDraft(policy: Policy): Draft {
    const filter = policy.siteFilter as SiteFilter | undefined
    return { enabled: filter?.enabled ?? false, dnsHost: filter?.dnsHost ?? '' }
}

function hostProblem(host: string): string | null {
    if (/[\s:/@?#]/.test(host)) return 'Enter just a host name such as dns.google, without a web address, port, or IP address.'
    if (/^\d+(\.\d+){3}$/.test(host)) return 'Enter a host name, not an IP address.'
    const labels = host.split('.')
    if (host.length > 253 || labels.length < 2 || !labels.every((label) => LABEL.test(label))) return 'That is not a valid host name.'
    return null
}

export function validateDraft(draft: Draft): ValidationResult {
    const host = normalizeHost(draft.dnsHost)
    const errors: string[] = []
    if (host === '') {
        if (draft.enabled) errors.push('Enter the filtering host name. Without one the phone filters nothing.')
    } else {
        const problem = hostProblem(host)
        if (problem) errors.push(problem)
    }
    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, filter: host === '' ? { enabled: draft.enabled } : { enabled: draft.enabled, dnsHost: host } }
}

/** Merge into the stored section so fields this console does not edit are kept in the browser's copy. */
export function applySiteFilter(policy: Policy, filter: SiteFilter): Policy {
    const existing = policy.siteFilter
    const merged: Record<string, unknown> = { ...(typeof existing === 'object' && existing !== null ? existing : {}), ...filter }
    if (filter.dnsHost === undefined) delete merged.dnsHost
    return withSection(policy, 'siteFilter', merged)
}

export function filterWarning(before: Draft, after: Draft): string | null {
    const host = normalizeHost(after.dnsHost)
    if (!after.enabled || host === '') return null
    if (before.enabled && normalizeHost(before.dnsHost) === host) return null
    return 'A wrong or unreachable host can stop the phone looking up addresses, which may also stop it from receiving a corrected policy. Test with a host you know works first. Save anyway?'
}

/** Filtering rests on Private DNS, so the child could undo it unless those settings are locked. */
export function unlockedNote(enabled: boolean, policy: Policy): string | null {
    if (!enabled) return null
    const restrictions = policy.restrictions as { blockPrivateDnsConfig?: boolean } | undefined
    if (restrictions?.blockPrivateDnsConfig) return null
    return 'Private DNS settings were not locked when this was opened (see Settings restrictions), so the child could change the filter.'
}
