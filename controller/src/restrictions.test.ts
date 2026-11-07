import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RESTRICTIONS, activeCount, applyRestrictions, toDraft } from './restrictions.ts'
import type { Policy } from './policy.ts'

test('the five restrictions match the keys the agent and server define', () => {
    assert.deepEqual(RESTRICTIONS.map((item) => item.key), ['blockVpnConfig', 'blockPrivateDnsConfig', 'blockFactoryReset', 'blockSafeBoot', 'blockAddUser', 'blockDebugging'])
})

test('toDraft reads true flags only, and treats absent or odd values as off', () => {
    assert.deepEqual(toDraft({ version: 0 }), { blockVpnConfig: false, blockPrivateDnsConfig: false, blockFactoryReset: false, blockSafeBoot: false, blockAddUser: false, blockDebugging: false })
    const draft = toDraft({ version: 1, restrictions: { blockSafeBoot: true, blockVpnConfig: 'yes', blockAddUser: 1 } })
    assert.deepEqual(draft, { blockVpnConfig: false, blockPrivateDnsConfig: false, blockFactoryReset: false, blockSafeBoot: true, blockAddUser: false, blockDebugging: false })
})

test('applyRestrictions writes all five flags and keeps other sections and extra fields', () => {
    const policy: Policy = { version: 3, location: { enabled: true }, restrictions: { blockSafeBoot: true, extra: 'keep' } }
    const draft = { blockVpnConfig: true, blockPrivateDnsConfig: false, blockFactoryReset: false, blockSafeBoot: false, blockAddUser: false, blockDebugging: false }
    assert.deepEqual(applyRestrictions(policy, draft), { ...policy, restrictions: { ...draft, extra: 'keep' } })
    assert.deepEqual((policy.restrictions as { blockSafeBoot: boolean }).blockSafeBoot, true)
})

test('turning every restriction off sends five false flags; the server then omits them, which the agent reads as off', () => {
    const off = { blockVpnConfig: false, blockPrivateDnsConfig: false, blockFactoryReset: false, blockSafeBoot: false, blockAddUser: false, blockDebugging: false }
    assert.deepEqual(applyRestrictions({ version: 1, restrictions: { blockVpnConfig: true } }, off), { version: 1, restrictions: off })
    assert.equal(activeCount(off), 0)
    assert.equal(activeCount({ ...off, blockSafeBoot: true, blockAddUser: true }), 2)
})
