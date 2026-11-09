import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAge, childLines, FAMILY_VALUES_SITES, matchingAge, minutesLabel, readCards, setBedtimeHour, setCard, setMinutes, sitesOf, SOCIAL_SITES, warningFor } from './ruleCards.ts'

const empty = { version: 1 }

test('an empty policy has every card off', () => {
    assert.ok(Object.values(readCards(empty).on).every((on) => !on))
})

test('adult and ads are separate switches over one filter', () => {
    const adult = setCard(empty, 'adult', true)
    assert.equal((adult.siteFilter as { dnsHost: string }).dnsHost, 'family.cloudflare-dns.com')
    assert.deepEqual([readCards(adult).on.adult, readCards(adult).on.ads], [true, false])

    const both = setCard(adult, 'ads', true)
    assert.equal((both.siteFilter as { dnsHost: string }).dnsHost, 'family.adguard-dns.com')
    assert.deepEqual([readCards(both).on.adult, readCards(both).on.ads], [true, true])

    const adsOnly = setCard(both, 'adult', false)
    assert.equal((adsOnly.siteFilter as { dnsHost: string }).dnsHost, 'dns.adguard-dns.com')
    assert.deepEqual([readCards(adsOnly).on.adult, readCards(adsOnly).on.ads], [false, true])
})

test('the filter comes with what closes the ways around it, and all of it goes when both are off', () => {
    const on = setCard(empty, 'adult', true)
    assert.deepEqual(on.restrictions, { blockPrivateDnsConfig: true, blockVpnConfig: true })
    assert.deepEqual(on.browser, { safeSearch: true, secureDnsOff: true, blockOtherBrowsers: true })
    const off = setCard(on, 'adult', false)
    assert.deepEqual(off.siteFilter, { enabled: false })
    assert.deepEqual(off.restrictions, { blockPrivateDnsConfig: false, blockVpnConfig: false })
    assert.deepEqual(off.browser, { safeSearch: false, secureDnsOff: false, blockOtherBrowsers: false })
})

test('a host the parent typed counts as a filter, and other browser and restriction fields survive', () => {
    const policy = { version: 2, siteFilter: { enabled: true, dnsHost: 'my.filter.example' }, restrictions: { blockDebugging: true }, browser: { youtube: 'strict' } }
    assert.equal(readCards(policy).on.adult, true)
    const next = setCard(policy, 'ads', true)
    assert.equal((next.restrictions as { blockDebugging: boolean }).blockDebugging, true)
    assert.equal((next.browser as { youtube: string }).youtube, 'strict')
})

test('family values adds its sites and removes only its own', () => {
    const policy = { version: 1, browser: { blockedSites: ['mine.example', 'bet365.com'] } }
    const on = setCard(policy, 'values', true)
    assert.equal(readCards(on).on.values, true)
    assert.equal(new Set(sitesOf(on)).size, sitesOf(on).length)
    assert.deepEqual(sitesOf(setCard(on, 'values', false)), ['mine.example'])
    assert.ok(FAMILY_VALUES_SITES.length <= 200)
})

test('social media sets one shared rule and closes its websites', () => {
    const on = setMinutes(setCard(empty, 'social', true), 'social', 45)
    const state = readCards(on)
    assert.deepEqual([state.on.social, state.socialMinutes], [true, 45])
    assert.ok(SOCIAL_SITES.every((site) => sitesOf(on).includes(site)))
    const off = setCard(on, 'social', false)
    assert.equal(readCards(off).on.social, false)
    assert.deepEqual(sitesOf(off), [])
    assert.equal((off.timeLimits as { enabled: boolean }).enabled, false)
})

test('turning social off keeps another rule enforced', () => {
    const policy = { version: 1, timeLimits: { enabled: true, rules: [{ category: 'Snapchat', packages: ['com.snapchat.android'], dailyMinutes: 10 }] } }
    const off = setCard(setCard(policy, 'social', true), 'social', false)
    assert.deepEqual((off.timeLimits as { enabled: boolean; rules: { category: string }[] }).rules.map((rule) => rule.category), ['Snapchat'])
    assert.equal((off.timeLimits as { enabled: boolean }).enabled, true)
})

test('games is a rule for all games, with no list of apps', () => {
    const on = setCard(empty, 'games', true)
    assert.deepEqual((on.timeLimits as { rules: unknown[] }).rules, [{ category: 'Games', packages: [], dailyMinutes: 60, allGames: true }])
})

test('a bedtime the card cannot express is kept when switched', () => {
    const windows = [{ days: [6, 7], fromHour: 22, toHour: 8 }]
    const policy = { version: 1, lockSchedule: { enabled: true, windows } }
    assert.equal(readCards(policy).bedtimeCustom, true)
    const off = setCard(policy, 'bedtime', false)
    assert.equal(readCards(off).on.bedtime, false)
    assert.deepEqual(setCard(off, 'bedtime', true).lockSchedule, { enabled: true, windows })
})

test('bedtime stays within the evening', () => {
    assert.equal(readCards(setBedtimeHour(empty, 30)).bedtimeHour, 23)
    assert.equal(readCards(setBedtimeHour(empty, 2)).bedtimeHour, 18)
})

test('an age sets every card, and is recognized until a card changes', () => {
    const policy = applyAge(empty, '10 to 13')
    assert.equal(matchingAge(policy), '10 to 13')
    const state = readCards(policy)
    assert.deepEqual([state.socialMinutes, state.gamesMinutes, state.bedtimeHour], [30, 60, 21])
    assert.equal(matchingAge(setMinutes(policy, 'social', 45)), null)
    assert.equal(matchingAge(applyAge(empty, '14 to 17')), '14 to 17')
    assert.equal(readCards(applyAge(empty, 'Under 10')).socialMinutes, 0)
})

test('an age never touches the debugging block', () => {
    const policy = applyAge({ version: 1, restrictions: { blockDebugging: false } }, 'Under 10')
    assert.equal((policy.restrictions as { blockDebugging: boolean }).blockDebugging, false)
})

test('sending data away or blocking at once is said before saving, only when it is new', () => {
    assert.match(warningFor(empty, setCard(empty, 'location', true)) ?? '', /location/)
    assert.match(warningFor(empty, setCard(empty, 'report', true)) ?? '', /Minutes per app/)
    assert.match(warningFor(empty, setMinutes(empty, 'games', 0)) ?? '', /blocked at once/)
    assert.equal(warningFor(setCard(empty, 'location', true), setCard(empty, 'location', true)), null)
    assert.equal(warningFor(empty, setCard(empty, 'adult', true)), null)
})

test('the child preview lists what is on', () => {
    const lines = childLines(readCards(setCard(setMinutes(empty, 'social', 90), 'adult', true)))
    assert.ok(lines.includes('Adult websites are blocked.'))
    assert.ok(lines.some((line) => line.includes('1 h 30 min a day')))
    assert.deepEqual(childLines(readCards(empty)), [])
})

test('an age never turns on call history, and the child preview says when it is on', () => {
    assert.equal(readCards(applyAge(empty, 'Under 10')).calls, false)
    assert.deepEqual(childLines(readCards({ version: 1, callLog: { enabled: true } })), ['Your parent sees the number, direction, time and length of your calls.'])
})

test('minutes read plainly', () => {
    assert.equal(minutesLabel(0), 'Blocked')
    assert.equal(minutesLabel(45), '45 min')
    assert.equal(minutesLabel(120), '2 h')
})
