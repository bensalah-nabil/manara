import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addApp, addSite, customApps, customSites, KNOWN_APPS, parseTarget, removeApp, removeSite } from './customRules.ts'
import { setCard, setMinutes } from './ruleCards.ts'

test('an app is found by name, in any case, and by a common alias', () => {
    assert.deepEqual(parseTarget('snapchat'), { kind: 'app', name: 'Snapchat', id: 'com.snapchat.android' })
    assert.deepEqual(parseTarget(' PUBG '), { kind: 'app', name: 'PUBG Mobile', id: 'com.tencent.ig' })
    assert.deepEqual(parseTarget('free fire'), { kind: 'app', name: 'Free Fire', id: 'com.dts.freefireth' })
})

test('a Play Store link gives the app, wherever its id sits in the link', () => {
    assert.deepEqual(parseTarget('https://play.google.com/store/apps/details?id=com.example.game'), { kind: 'app', name: 'com.example.game', id: 'com.example.game' })
    assert.deepEqual(parseTarget('https://play.google.com/store/apps/details?hl=fr&id=com.whatsapp&gl=TN'), { kind: 'app', name: 'WhatsApp', id: 'com.whatsapp' })
})

test('an app id is told apart from a web address', () => {
    assert.equal(parseTarget('com.supercell.hayday').kind, 'app')
    assert.equal(parseTarget('tv.twitch.android.app').kind, 'app')
    assert.equal(parseTarget('org.mozilla.firefox').kind, 'app')
    assert.deepEqual(parseTarget('m.facebook.com'), { kind: 'site', site: 'm.facebook.com' })
    assert.deepEqual(parseTarget('example.com'), { kind: 'site', site: 'example.com' })
    assert.deepEqual(parseTarget('jeu.tn'), { kind: 'site', site: 'jeu.tn' })
})

test('a web address is cleaned up, keeping a path', () => {
    assert.deepEqual(parseTarget('https://www.Example.com/'), { kind: 'site', site: 'example.com' })
    assert.deepEqual(parseTarget('http://example.com/games/'), { kind: 'site', site: 'example.com/games' })
})

test('what it cannot read says how to fix it', () => {
    for (const text of ['my favourite game', 'unknownword']) {
        const target = parseTarget(text)
        assert.equal(target.kind, 'problem')
        assert.match((target as { message: string }).message, /Play Store link/)
    }
    assert.equal(parseTarget('  ').kind, 'problem')
})

test('every known app id has the shape Android expects, once each', () => {
    assert.equal(new Set(KNOWN_APPS.map((app) => app.id)).size, KNOWN_APPS.length)
    for (const app of KNOWN_APPS) assert.match(app.id, /^[a-z][\w]*(\.[\w]+)+$/i)
})

test('custom apps exclude the rules the cards own, and adding again replaces', () => {
    let policy = setCard(setMinutes({ version: 1 }, 'social', 30), 'games', true)
    policy = addApp(policy, 'Snapchat', 'com.snapchat.android', 20)
    policy = addApp(policy, 'Snapchat', 'com.snapchat.android', 0)
    assert.deepEqual(customApps(policy), [{ category: 'Snapchat', id: 'com.snapchat.android', dailyMinutes: 0 }])
    assert.deepEqual(customApps(removeApp(policy, 'Snapchat')), [])
    assert.equal((removeApp(policy, 'Snapchat').timeLimits as { enabled: boolean }).enabled, true)
})

test('custom sites exclude the lists the cards own', () => {
    const policy = setCard(setCard({ version: 1 }, 'values', true), 'social', true)
    const added = addSite(policy, 'mine.example')
    assert.ok(added.ok)
    assert.deepEqual(customSites(added.policy), ['mine.example'])
    assert.deepEqual(customSites(removeSite(added.policy, 'mine.example')), [])
})

test('a duplicate or a full list is refused with a reason', () => {
    const first = addSite({ version: 1 }, 'a.example')
    assert.ok(first.ok)
    const again = addSite(first.policy, 'a.example')
    assert.deepEqual(again, { ok: false, message: 'a.example is already blocked.' })
    const sites = Array.from({ length: 200 }, (_, i) => `s${i}.example`)
    const full = addSite({ version: 1, browser: { blockedSites: sites } }, 'b.example')
    assert.ok(!full.ok)
    assert.match(full.message, /full/)
})
