import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySiteFilter, filterWarning, normalizeHost, toDraft, unlockedNote, validateDraft } from './siteFilter.ts'
import type { Policy } from './policy.ts'

test('hosts are canonicalized: trimmed, lower-cased, no trailing dot', () => {
    assert.equal(normalizeHost('  Family.AdGuard-DNS.com. '), 'family.adguard-dns.com')
})

test('a valid host is accepted and stored in canonical form', () => {
    assert.deepEqual(validateDraft({ enabled: true, dnsHost: ' DNS.Google ' }), { ok: true, filter: { enabled: true, dnsHost: 'dns.google' } })
    assert.equal(validateDraft({ enabled: true, dnsHost: 'family.adguard-dns.com' }).ok, true)
    assert.equal(validateDraft({ enabled: true, dnsHost: 'a1.b2-c3.example' }).ok, true)
})

test('an enabled filter needs a host, since the agent would otherwise filter nothing', () => {
    for (const blank of ['', '   ', '.']) {
        const result = validateDraft({ enabled: true, dnsHost: blank })
        assert.equal(result.ok, false, `"${blank}" should be rejected`)
        if (!result.ok) assert.match(result.errors[0], /filters nothing/)
    }
})

test('a disabled filter may have no host, and keeps a valid one', () => {
    assert.deepEqual(validateDraft({ enabled: false, dnsHost: '' }), { ok: true, filter: { enabled: false } })
    assert.deepEqual(validateDraft({ enabled: false, dnsHost: 'dns.google' }), { ok: true, filter: { enabled: false, dnsHost: 'dns.google' } })
})

test('a bad host is rejected even when the filter is off, so it is never stored', () => {
    assert.equal(validateDraft({ enabled: false, dnsHost: 'not valid!' }).ok, false)
})

test('URLs, ports, paths, addresses, and malformed names are rejected', () => {
    for (const bad of ['https://dns.google', 'dns.google:853', 'dns.google/dns-query', 'user@dns.google', '8.8.8.8', 'localhost', 'a..b.com', '-a.example', 'a-.example', 'under_score.example', 'dns google', 'x'.repeat(64) + '.com', ('a.'.repeat(130)) + 'com']) {
        assert.equal(validateDraft({ enabled: true, dnsHost: bad }).ok, false, `${bad} should be rejected`)
    }
})

test('toDraft reads the stored section and handles absence', () => {
    assert.deepEqual(toDraft({ version: 1, siteFilter: { enabled: true, dnsHost: 'dns.google' } }), { enabled: true, dnsHost: 'dns.google' })
    assert.deepEqual(toDraft({ version: 0 }), { enabled: false, dnsHost: '' })
})

test('applySiteFilter merges into the stored section, and removes a cleared host', () => {
    const policy: Policy = { version: 3, siteFilter: { enabled: true, dnsHost: 'old.example', extra: 1 }, location: { enabled: true } }
    assert.deepEqual(applySiteFilter(policy, { enabled: true, dnsHost: 'dns.google' }), { ...policy, siteFilter: { enabled: true, dnsHost: 'dns.google', extra: 1 } })
    assert.deepEqual(applySiteFilter(policy, { enabled: false }), { ...policy, siteFilter: { enabled: false, extra: 1 } })
    assert.deepEqual(applySiteFilter({ version: 1 }, { enabled: false }), { version: 1, siteFilter: { enabled: false } })
    assert.equal((policy.siteFilter as { dnsHost: string }).dnsHost, 'old.example')
})

test('the host warning appears only when a host is being newly enabled or changed', () => {
    const on = (dnsHost: string) => ({ enabled: true, dnsHost })
    assert.match(filterWarning({ enabled: false, dnsHost: '' }, on('dns.google')) ?? '', /unreachable host/)
    assert.match(filterWarning(on('a.example'), on('b.example')) ?? '', /unreachable host/)
    assert.match(filterWarning({ enabled: false, dnsHost: 'dns.google' }, on('dns.google')) ?? '', /unreachable host/)
    assert.equal(filterWarning(on('dns.google'), on(' DNS.google ')), null)
    assert.equal(filterWarning(on('dns.google'), { enabled: false, dnsHost: 'dns.google' }), null)
    assert.equal(filterWarning({ enabled: false, dnsHost: '' }, { enabled: false, dnsHost: '' }), null)
})

test('the unlocked note warns only when filtering is on and Private DNS settings are not locked', () => {
    assert.equal(unlockedNote(false, { version: 1 }), null)
    assert.match(unlockedNote(true, { version: 1 }) ?? '', /could change the filter/)
    assert.match(unlockedNote(true, { version: 1, restrictions: { blockPrivateDnsConfig: false } }) ?? '', /could change/)
    assert.equal(unlockedNote(true, { version: 1, restrictions: { blockPrivateDnsConfig: true } }), null)
})
