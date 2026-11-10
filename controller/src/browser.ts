import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import { t } from './i18n.ts'

/** Chrome's managed configuration; the phone maps each field to Chrome's own policy (BrowserPolicyDecision.kt). */
export interface BrowserPolicy {
    safeSearch: boolean
    youtube: YouTubeMode
    secureDnsOff: boolean
    blockedSites: string[]
    blockOtherBrowsers: boolean
}

export type YouTubeMode = 'off' | 'moderate' | 'strict'

export const YOUTUBE_MODES: { key: YouTubeMode; label: string }[] = [
    { key: 'off', label: t('chromeEditor.youtubeOff') },
    { key: 'moderate', label: t('chromeEditor.youtubeModerate') },
    { key: 'strict', label: t('chromeEditor.youtubeStrict') },
]

/** Same limit as the server (domain.MaxBlockedSites) and the phone. */
export const MAX_SITES = 200

export interface Draft {
    safeSearch: boolean
    youtube: YouTubeMode
    secureDnsOff: boolean
    /** One site per line, as the parent types them. */
    sitesText: string
    blockOtherBrowsers: boolean
}

export type ValidationResult = { ok: true; browser: BrowserPolicy } | { ok: false; errors: string[] }

export function toDraft(policy: Policy): Draft {
    const stored = (policy.browser ?? {}) as Partial<BrowserPolicy>
    const youtube = YOUTUBE_MODES.some((mode) => mode.key === stored.youtube) ? (stored.youtube as YouTubeMode) : 'off'
    return {
        safeSearch: stored.safeSearch === true,
        youtube,
        secureDnsOff: stored.secureDnsOff === true,
        sitesText: Array.isArray(stored.blockedSites) ? stored.blockedSites.filter((s) => typeof s === 'string').join('\n') : '',
        blockOtherBrowsers: stored.blockOtherBrowsers === true,
    }
}

/** "https://www.Example.com/path" becomes "www.example.com/path": Chrome's blocklist takes host-and-path patterns. */
export function normalizeSite(text: string): string {
    return text.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/$/, '')
}

export function validateDraft(draft: Draft): ValidationResult {
    const errors: string[] = []
    const sites: string[] = []
    for (const line of draft.sitesText.split(/\r?\n/)) {
        const site = normalizeSite(line)
        if (site === '') continue
        if (/\s/.test(site) || site.length > 253) {
            errors.push(t('chromeEditor.errNotSite', { line: line.trim() }))
        } else if (!sites.includes(site)) {
            sites.push(site)
        }
    }
    if (sites.length > MAX_SITES) errors.push(t('chromeEditor.errTooMany', { n: MAX_SITES }))
    if (errors.length > 0) return { ok: false, errors }
    return { ok: true, browser: { safeSearch: draft.safeSearch, youtube: draft.youtube, secureDnsOff: draft.secureDnsOff, blockedSites: sites, blockOtherBrowsers: draft.blockOtherBrowsers } }
}

/** Merge into the stored section so fields this console does not edit are kept in the browser's copy. */
export function applyBrowser(policy: Policy, browser: BrowserPolicy): Policy {
    const existing = policy.browser
    return withSection(policy, 'browser', { ...(typeof existing === 'object' && existing !== null ? existing : {}), ...browser })
}

/** A secure-DNS bypass only matters when site filtering is on, so say so where the parent decides. */
export function secureDnsNote(siteFilterOn: boolean): string {
    return siteFilterOn
        ? t('chromeEditor.secureDnsOn')
        : t('chromeEditor.secureDnsOff')
}
