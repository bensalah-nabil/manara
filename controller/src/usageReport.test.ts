import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Policy } from './policy.ts'
import { USAGE_REPORT_WARNING, applyUsageReport, toDraft } from './usageReport.ts'

test('absent or malformed means off', () => {
    assert.deepEqual(toDraft({ version: 1 }), { enabled: false })
    assert.deepEqual(toDraft({ version: 1, usageReport: {} }), { enabled: false })
    assert.deepEqual(toDraft({ version: 1, usageReport: { enabled: 'yes' } }), { enabled: false })
    assert.deepEqual(toDraft({ version: 1, usageReport: { enabled: true } }), { enabled: true })
})

test('applyUsageReport changes only usageReport and keeps every other section, even unknown ones', () => {
    const policy: Policy = { version: 3, location: { enabled: true, intervalMinutes: 15 }, restrictions: { blockSafeBoot: true }, future: { keep: 1 } }
    assert.deepEqual(applyUsageReport(policy, { enabled: true }), { ...policy, usageReport: { enabled: true } })
})

test('the warning tells the parent the child can see it', () => {
    assert.match(USAGE_REPORT_WARNING, /child can see it/)
})
