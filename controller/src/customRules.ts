import type { Policy } from './policy.ts'
import { FAMILY_VALUES_SITES, GAMES_RULE, rulesOf, SOCIAL_RULE, SOCIAL_SITES, sitesOf, withRules, withSites } from './ruleCards.ts'
import { MAX_SITES } from './browser.ts'
import { t } from './i18n.ts'

/** Common apps by the names parents use for them. Each id was checked on Google Play on 2026-11-09. */
export const KNOWN_APPS: { name: string; id: string; aliases?: string[] }[] = [
    { name: 'Snapchat', id: 'com.snapchat.android', aliases: ['snap'] },
    { name: 'WhatsApp', id: 'com.whatsapp' },
    { name: 'YouTube', id: 'com.google.android.youtube' },
    { name: 'Telegram', id: 'org.telegram.messenger' },
    { name: 'Roblox', id: 'com.roblox.client' },
    { name: 'PUBG Mobile', id: 'com.tencent.ig', aliases: ['pubg'] },
    { name: 'Free Fire', id: 'com.dts.freefireth' },
    { name: 'Discord', id: 'com.discord' },
    { name: 'X', id: 'com.twitter.android', aliases: ['twitter'] },
    { name: 'Threads', id: 'com.instagram.barcelona' },
    { name: 'Messenger', id: 'com.facebook.orca' },
    { name: 'Netflix', id: 'com.netflix.mediaclient' },
    { name: 'Likee', id: 'video.like' },
    { name: 'CapCut', id: 'com.lemon.lvoverseas' },
    { name: 'Reddit', id: 'com.reddit.frontpage' },
    { name: 'Pinterest', id: 'com.pinterest' },
    { name: 'Minecraft', id: 'com.mojang.minecraftpe' },
    { name: 'Clash of Clans', id: 'com.supercell.clashofclans' },
    { name: 'Candy Crush', id: 'com.king.candycrushsaga' },
    { name: 'Twitch', id: 'tv.twitch.android.app' },
    { name: 'Kwai', id: 'com.kwai.video' },
    { name: 'Brawl Stars', id: 'com.supercell.brawlstars' },
    { name: 'Subway Surfers', id: 'com.kiloo.subwaysurf' },
]

export type Target =
    | { kind: 'app'; name: string; id: string }
    | { kind: 'site'; site: string }
    | { kind: 'problem'; message: string }

const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i
const REVERSED_DOMAIN_START = new Set(['com', 'org', 'net', 'io', 'app', 'co', 'tv', 'me', 'video', 'dev', 'de', 'fr', 'uk', 'jp', 'cn', 'ru', 'in', 'br'])
const WEB_ENDING = new Set(['com', 'org', 'net', 'io', 'co', 'tv', 'me', 'app', 'dev', 'info', 'xyz', 'site', 'online', 'live', 'gg', 'tn', 'fr', 'uk', 'de', 'ma', 'dz', 'eg', 'sa', 'ae', 'ru', 'cn', 'jp', 'in', 'br', 'es', 'it', 'nl', 'tr'])

/** Understands whatever a parent is likely to paste or type: an app's name, a Play link, an app id, a web address. */
export function parseTarget(text: string): Target {
    const input = text.trim()
    if (input === '') return { kind: 'problem', message: t('rules.ownEmpty') }

    const known = KNOWN_APPS.find((app) => app.name.toLowerCase() === input.toLowerCase() || app.aliases?.includes(input.toLowerCase()))
    if (known) return { kind: 'app', name: known.name, id: known.id }

    const playId = /play\.google\.com\/store\/apps\/details\?(?:[^#]*&)?id=([\w.]+)/i.exec(input)?.[1]
    if (playId) return appFromId(playId)

    if (/\s/.test(input)) {
        return { kind: 'problem', message: t('rules.ownUnknown', { input }) }
    }
    const isAddress = /^[a-z]+:\/\//i.test(input) || input.includes('/')
    const address = input.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLowerCase()
    if (!isAddress && PACKAGE.test(input)) {
        const parts = input.toLowerCase().split('.')
        if (REVERSED_DOMAIN_START.has(parts[0]) && !(parts.length === 2 && WEB_ENDING.has(parts[1]))) return appFromId(input)
        if (!WEB_ENDING.has(parts[parts.length - 1]) && parts.length > 2) return appFromId(input)
    }
    if (address.includes('.') && /^[a-z0-9.-]+(\/\S*)?$/.test(address)) return { kind: 'site', site: address }
    return { kind: 'problem', message: t('rules.ownUnknown', { input }) }
}

function appFromId(id: string): Target {
    const known = KNOWN_APPS.find((app) => app.id === id)
    return { kind: 'app', name: known?.name ?? id, id }
}

export interface CustomApp {
    category: string
    id: string
    dailyMinutes: number
}

/** Rules the cards don't own: added here, or made earlier in Advanced. */
export function customApps(policy: Policy): CustomApp[] {
    return rulesOf(policy)
        .filter((rule) => rule.category !== SOCIAL_RULE && rule.category !== GAMES_RULE && !rule.allGames)
        .map((rule) => ({ category: rule.category, id: (rule.packages ?? []).join(', '), dailyMinutes: rule.dailyMinutes }))
}

export function customSites(policy: Policy): string[] {
    return sitesOf(policy).filter((site) => !FAMILY_VALUES_SITES.includes(site) && !SOCIAL_SITES.includes(site))
}

/** Adding an app that already has its own rule replaces that rule. */
export function addApp(policy: Policy, name: string, id: string, minutes: number): Policy {
    const others = rulesOf(policy).filter((rule) => !(rule.packages?.length === 1 && rule.packages[0] === id) && rule.category !== name)
    return withRules(policy, [...others, { category: name, packages: [id], dailyMinutes: Math.min(1440, Math.max(0, minutes)) }])
}

export function removeApp(policy: Policy, category: string): Policy {
    return withRules(policy, rulesOf(policy).filter((rule) => rule.category !== category))
}

export function addSite(policy: Policy, site: string): { ok: true; policy: Policy } | { ok: false; message: string } {
    const sites = sitesOf(policy)
    if (sites.includes(site)) return { ok: false, message: t('rules.ownAlready', { site }) }
    if (sites.length >= MAX_SITES) return { ok: false, message: t('rules.ownFull', { n: MAX_SITES }) }
    return { ok: true, policy: withSites(policy, [...sites, site]) }
}

export function removeSite(policy: Policy, site: string): Policy {
    return withSites(policy, sitesOf(policy).filter((existing) => existing !== site))
}
