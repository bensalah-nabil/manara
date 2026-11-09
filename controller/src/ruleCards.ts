import type { Policy } from './policy.ts'
import { FAMILY_FILTER_HOST } from './siteFilter.ts'
import { SOCIAL_MEDIA_PACKAGES } from './timeLimits.ts'

/**
 * The Rules screen's cards: each one is a plain name for several policy fields. This file holds no
 * rules of its own and only reads and writes the policy the phone already understands.
 */
export type CardId = 'adult' | 'ads' | 'values' | 'social' | 'games' | 'bedtime' | 'protect' | 'location' | 'report'

export interface CardsState {
    on: Record<CardId, boolean>
    socialMinutes: number
    gamesMinutes: number
    bedtimeHour: number
    /** The schedule isn't one nightly window, so the card can't show or step it (Advanced can). */
    bedtimeCustom: boolean
    /** Set under Sharing, never by a card or an age, but the child still sees it. */
    calls: boolean
}

interface Rule {
    category: string
    packages?: string[]
    dailyMinutes: number
    allGames?: boolean
}

export const SOCIAL_RULE = 'Social media'
export const GAMES_RULE = 'Games'
export const SOCIAL_SITES = ['tiktok.com', 'facebook.com', 'instagram.com']
const BEDTIME_END = 7
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

/** Each filter's coverage was sampled by DNS query on 2026-11-09 (docs/pending-verifications.md). */
const ADULT_ONLY_HOST = 'family.cloudflare-dns.com'
const ADS_ONLY_HOST = 'dns.adguard-dns.com'

/** Blocked in Chrome, the only browser left open with the adult card on. Each one resolved on 2026-11-09. */
export const FAMILY_VALUES_SITES = [
    'bet365.com', '1xbet.com', 'melbet.com', 'betway.com', 'stake.com', 'pokerstars.com', '888.com', '888casino.com',
    'williamhill.com', 'unibet.com', 'betfair.com', 'paddypower.com', 'bwin.com', 'draftkings.com', 'fanduel.com',
    'parimatch.com', '22bet.com', 'linebet.com', 'mostbet.com', 'betwinner.com', 'casino.com',
    'tinder.com', 'badoo.com', 'bumble.com', 'okcupid.com', 'match.com', 'hinge.co', 'grindr.com', 'pof.com', 'happn.com', 'zoosk.com',
    'budweiser.com', 'heineken.com', 'corona.com', 'jackdaniels.com', 'smirnoff.com', 'totalwine.com', 'wine.com',
]

function section(policy: Policy, key: string): Record<string, unknown> {
    const value = policy[key]
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function rulesOf(policy: Policy): Rule[] {
    const rules = section(policy, 'timeLimits').rules
    return Array.isArray(rules) ? (rules as Rule[]) : []
}

export function sitesOf(policy: Policy): string[] {
    const sites = section(policy, 'browser').blockedSites
    return Array.isArray(sites) ? sites.filter((site): site is string => typeof site === 'string') : []
}

export function withRules(policy: Policy, rules: Rule[]): Policy {
    return { ...policy, timeLimits: { ...section(policy, 'timeLimits'), enabled: rules.length > 0, rules } }
}

export function withSites(policy: Policy, sites: string[]): Policy {
    return { ...policy, browser: { ...section(policy, 'browser'), blockedSites: sites } }
}

function nightlyHour(schedule: Record<string, unknown>): number | null {
    const windows = schedule.windows
    if (!Array.isArray(windows) || windows.length !== 1) return null
    const window = windows[0] as { days?: number[]; fromHour?: number; toHour?: number }
    const allDays = ALL_DAYS.every((day) => window.days?.includes(day))
    return allDays && window.toHour === BEDTIME_END && typeof window.fromHour === 'number' ? window.fromHour : null
}

export function readCards(policy: Policy): CardsState {
    const filter = section(policy, 'siteFilter')
    const host = filter.enabled === true ? String(filter.dnsHost ?? '') : ''
    const restrictions = section(policy, 'restrictions')
    const limitsOn = section(policy, 'timeLimits').enabled === true
    const rules = rulesOf(policy)
    const social = rules.find((rule) => rule.category === SOCIAL_RULE)
    const games = rules.find((rule) => rule.category === GAMES_RULE)
    const sites = sitesOf(policy)
    const schedule = section(policy, 'lockSchedule')
    const hour = nightlyHour(schedule)
    const hasWindows = Array.isArray(schedule.windows) && schedule.windows.length > 0
    return {
        on: {
            adult: host !== '' && host !== ADS_ONLY_HOST,
            ads: host === FAMILY_FILTER_HOST || host === ADS_ONLY_HOST,
            values: FAMILY_VALUES_SITES.every((site) => sites.includes(site)),
            social: limitsOn && social !== undefined,
            games: limitsOn && games !== undefined,
            bedtime: schedule.enabled === true && hasWindows,
            protect: restrictions.blockFactoryReset === true && restrictions.blockSafeBoot === true &&
                restrictions.blockAddUser === true && restrictions.blockDateTime === true,
            location: section(policy, 'location').enabled === true,
            report: section(policy, 'usageReport').enabled === true,
        },
        socialMinutes: social?.dailyMinutes ?? 60,
        gamesMinutes: games?.dailyMinutes ?? 60,
        bedtimeHour: hour ?? 21,
        bedtimeCustom: hasWindows && hour === null,
        calls: section(policy, 'callLog').enabled === true,
    }
}

/** The filter behind the adult and ads cards, with what stops it being switched off or gone around. */
function withFilter(policy: Policy, adult: boolean, ads: boolean): Policy {
    const host = adult && ads ? FAMILY_FILTER_HOST : adult ? ADULT_ONLY_HOST : ads ? ADS_ONLY_HOST : null
    const on = host !== null
    return {
        ...policy,
        siteFilter: on ? { enabled: true, dnsHost: host } : { enabled: false },
        restrictions: { ...section(policy, 'restrictions'), blockPrivateDnsConfig: on, blockVpnConfig: on },
        browser: { ...section(policy, 'browser'), safeSearch: adult, secureDnsOff: on, blockOtherBrowsers: on },
    }
}

function withRule(policy: Policy, rule: Rule): Policy {
    const others = rulesOf(policy).filter((existing) => existing.category !== rule.category)
    return withRules(policy, [...others, rule])
}

function withoutRule(policy: Policy, category: string): Policy {
    return withRules(policy, rulesOf(policy).filter((rule) => rule.category !== category))
}

function socialRule(minutes: number): Rule {
    return { category: SOCIAL_RULE, packages: [...SOCIAL_MEDIA_PACKAGES], dailyMinutes: minutes }
}

function gamesRule(minutes: number): Rule {
    return { category: GAMES_RULE, packages: [], dailyMinutes: minutes, allGames: true }
}

function withBedtime(policy: Policy, hour: number): Policy {
    return { ...policy, lockSchedule: { enabled: true, windows: [{ days: ALL_DAYS, fromHour: hour, toHour: BEDTIME_END }] } }
}

export function setCard(policy: Policy, id: CardId, on: boolean): Policy {
    const state = readCards(policy)
    const sites = sitesOf(policy)
    switch (id) {
        case 'adult':
            return withFilter(policy, on, state.on.ads)
        case 'ads':
            return withFilter(policy, state.on.adult, on)
        case 'values':
            return withSites(policy, on ? [...new Set([...sites, ...FAMILY_VALUES_SITES])] : sites.filter((site) => !FAMILY_VALUES_SITES.includes(site)))
        case 'social': {
            // The websites stay closed while the card is on, or a blocked app would just move to Chrome.
            const next = withSites(policy, on ? [...new Set([...sites, ...SOCIAL_SITES])] : sites.filter((site) => !SOCIAL_SITES.includes(site)))
            return on ? withRule(next, socialRule(state.socialMinutes)) : withoutRule(next, SOCIAL_RULE)
        }
        case 'games':
            return on ? withRule(policy, gamesRule(state.gamesMinutes)) : withoutRule(policy, GAMES_RULE)
        case 'bedtime': {
            if (!on) return { ...policy, lockSchedule: { ...section(policy, 'lockSchedule'), enabled: false } }
            return state.bedtimeCustom ? { ...policy, lockSchedule: { ...section(policy, 'lockSchedule'), enabled: true } } : withBedtime(policy, state.bedtimeHour)
        }
        case 'protect':
            return { ...policy, restrictions: { ...section(policy, 'restrictions'), blockFactoryReset: on, blockSafeBoot: on, blockAddUser: on, blockDateTime: on } }
        case 'location':
            return { ...policy, location: { intervalMinutes: 15, ...section(policy, 'location'), enabled: on } }
        case 'report':
            return { ...policy, usageReport: { enabled: on } }
    }
}

export function setMinutes(policy: Policy, id: 'social' | 'games', minutes: number): Policy {
    const clamped = Math.min(480, Math.max(0, minutes))
    return withRule(policy, id === 'social' ? socialRule(clamped) : gamesRule(clamped))
}

export function setBedtimeHour(policy: Policy, hour: number): Policy {
    return withBedtime(policy, Math.min(23, Math.max(18, hour)))
}

export const AGES = ['Under 10', '10 to 13', '14 to 17'] as const
export type Age = (typeof AGES)[number]

const AGE_SETTINGS: Record<Age, { social: number; games: number; bedtime: number; report: boolean }> = {
    'Under 10': { social: 0, games: 30, bedtime: 20, report: true },
    '10 to 13': { social: 30, games: 60, bedtime: 21, report: true },
    '14 to 17': { social: 60, games: 90, bedtime: 23, report: false },
}

export function applyAge(policy: Policy, age: Age): Policy {
    const settings = AGE_SETTINGS[age]
    let next = policy
    for (const id of ['values', 'social', 'protect', 'location'] as const) next = setCard(next, id, true)
    next = withFilter(next, true, true)
    next = setCard(next, 'report', settings.report)
    next = setMinutes(next, 'social', settings.social)
    next = setMinutes(next, 'games', settings.games)
    return setBedtimeHour(next, settings.bedtime)
}

/** Which age the cards match, so the choice needs no storing. Null once the parent has changed a card. */
export function matchingAge(policy: Policy): Age | null {
    const state = readCards(policy)
    if (Object.entries(state.on).some(([id, on]) => id !== 'report' && !on)) return null
    return AGES.find((age) => {
        const settings = AGE_SETTINGS[age]
        return state.socialMinutes === settings.social && state.gamesMinutes === settings.games &&
            state.bedtimeHour === settings.bedtime && state.on.report === settings.report && !state.bedtimeCustom
    }) ?? null
}

/** Starting to send data away, or blocking at once, is said out loud before it is saved. */
export function warningFor(before: Policy, after: Policy): string | null {
    const was = readCards(before)
    const will = readCards(after)
    const lines: string[] = []
    if (will.on.location && !was.on.location) lines.push('Your child\'s location is sent to you every 15 minutes. The phone shows a notice the whole time.')
    if (will.on.report && !was.on.report) lines.push('Minutes per app are sent to you each day. The phone says so.')
    if (will.on.social && will.socialMinutes === 0 && !(was.on.social && was.socialMinutes === 0)) lines.push('TikTok, Facebook and Instagram are blocked at once.')
    if (will.on.games && will.gamesMinutes === 0 && !(was.on.games && was.gamesMinutes === 0)) lines.push('Games are blocked at once.')
    return lines.length > 0 ? `${lines.join('\n')}\n\nContinue?` : null
}

export function minutesLabel(minutes: number): string {
    if (minutes === 0) return 'Blocked'
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return [hours > 0 ? `${hours} h` : '', rest > 0 ? `${rest} min` : ''].filter(Boolean).join(' ')
}

export function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`
}

/** The Rules screen's preview of what the child reads; the phone's own screen is the record. */
export function childLines(state: CardsState): string[] {
    const { on } = state
    const lines: string[] = []
    if (on.adult) lines.push('Adult websites are blocked.')
    if (on.ads) lines.push('Most ads in games and apps are blocked.')
    if (on.values) lines.push('Gambling, dating and alcohol websites are blocked in Chrome.')
    if (on.adult || on.ads) lines.push('Browsers other than Chrome are blocked.')
    if (on.social) lines.push(state.socialMinutes === 0 ? 'TikTok, Facebook and Instagram are blocked.' : `TikTok, Facebook and Instagram: ${minutesLabel(state.socialMinutes)} a day.`)
    if (on.games) lines.push(state.gamesMinutes === 0 ? 'Games are blocked.' : `Games: ${minutesLabel(state.gamesMinutes)} a day.`)
    if (on.bedtime) lines.push(state.bedtimeCustom ? 'The phone locks at set times.' : `The phone locks from ${hourLabel(state.bedtimeHour)} to ${hourLabel(BEDTIME_END)}.`)
    if (on.protect) lines.push('Some settings can\'t be changed.')
    if (on.location) lines.push('Your parent can see where this phone is.')
    if (on.report) lines.push('Your parent sees minutes per app.')
    if (state.calls) lines.push('Your parent sees the number, direction, time and length of your calls.')
    return lines
}
