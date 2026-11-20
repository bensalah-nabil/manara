import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAppChanges, MAX_SHOWN, summarizeAppChanges, toDraft } from './appChanges.ts'
import type { EventItem } from './protection.ts'

const event = (id: string, occurredAt: string, payload: Record<string, unknown>, kind = 'app_change'): EventItem => ({ id, kind, occurredAt, payload })

test('off unless the policy says on, and the rest of the policy is kept', () => {
    assert.deepEqual(toDraft({ version: 1 }), { enabled: false })
    assert.deepEqual(toDraft({ version: 1, appChanges: { enabled: true } }), { enabled: true })
    assert.deepEqual(applyAppChanges({ version: 2, location: { enabled: true } }, { enabled: true }), { version: 2, location: { enabled: true }, appChanges: { enabled: true } })
})

test('changes come newest first, with the app name, or the package when the name is missing', () => {
    const items = summarizeAppChanges([
        event('a', '2026-11-19T10:00:00Z', { action: 'installed', package: 'com.zhiliaoapp.musically', label: 'TikTok' }),
        event('b', '2026-11-20T08:00:00Z', { action: 'removed', package: 'org.example.vpn', label: '  ' }),
    ])
    assert.deepEqual(items.map((item) => [item.action, item.label]), [['removed', 'org.example.vpn'], ['installed', 'TikTok']])
})

test('a malformed event, another kind, or one seen twice is left out', () => {
    const good = event('a', '2026-11-19T10:00:00Z', { action: 'installed', package: 'com.whatsapp', label: 'WhatsApp' })
    const items = summarizeAppChanges([
        good,
        good,
        event('b', 'not a date', { action: 'installed', package: 'x.y' }),
        event('c', '2026-11-19T10:00:00Z', { action: 'updated', package: 'x.y' }),
        event('d', '2026-11-19T10:00:00Z', { action: 'installed' }),
        event('e', '2026-11-19T10:00:00Z', { action: 'installed', package: 'x.y' }, 'call'),
    ])
    assert.deepEqual(items.map((item) => item.id), ['a'])
})

test('the list is capped', () => {
    const many = Array.from({ length: MAX_SHOWN + 20 }, (_, i) => event(`e${i}`, new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), { action: 'installed', package: `org.app${i}` }))
    assert.equal(summarizeAppChanges(many).length, MAX_SHOWN)
})
