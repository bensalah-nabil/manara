import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTimeLimits, blocksImmediately, emptyRule, parsePackages, toDraft, validateDraft } from './timeLimits.ts'
import type { Policy } from './policy.ts'

const rule = (category: string, packages: string, dailyMinutes: string) => ({ category, packages, dailyMinutes })

test('a valid draft converts to rules with trimmed, deduplicated packages', () => {
    const result = validateDraft({
        enabled: true,
        rules: [rule(' social ', 'com.a.b\ncom.c.d, com.a.b', '45')],
    })
    assert.deepEqual(result, {
        ok: true,
        timeLimits: { enabled: true, rules: [{ category: 'social', packages: ['com.a.b', 'com.c.d'], dailyMinutes: 45 }] },
    })
})

test('zero is a valid limit, and a disabled draft with no rules is valid', () => {
    const zero = validateDraft({ enabled: true, rules: [rule('x', 'com.a.b', '0')] })
    assert.equal(zero.ok, true)
    assert.deepEqual(validateDraft({ enabled: false, rules: [] }), { ok: true, timeLimits: { enabled: false, rules: [] } })
})

test('names must be present and unique, since the agent keys its state by name', () => {
    const missing = validateDraft({ enabled: true, rules: [rule('  ', 'com.a.b', '5')] })
    assert.equal(missing.ok, false)
    const duplicate = validateDraft({ enabled: true, rules: [rule('a', 'com.a.b', '5'), rule('a', 'com.c.d', '5')] })
    assert.equal(duplicate.ok, false)
    if (!duplicate.ok) assert.match(duplicate.errors[0], /Rule 2: the name "a" is already used/)
})

test('packages must exist and look like Android package names', () => {
    const none = validateDraft({ enabled: true, rules: [rule('a', '  ', '5')] })
    assert.equal(none.ok, false)
    for (const bad of ['notapackage', 'com..x', '1com.a', 'com.a b!', 'com.a-b.c']) {
        const result = validateDraft({ enabled: true, rules: [rule('a', bad, '5')] })
        assert.equal(result.ok, false, `${bad} should be rejected`)
    }
    assert.equal(validateDraft({ enabled: true, rules: [rule('a', 'com.google.android.youtube', '5')] }).ok, true)
})

test('minutes must be whole numbers from 0 to 1440', () => {
    for (const bad of ['', '-1', '1.5', 'abc', '1441', '1e3', ' ']) {
        assert.equal(validateDraft({ enabled: true, rules: [rule('a', 'com.a.b', bad)] }).ok, false, `${bad} should be rejected`)
    }
    for (const good of ['0', '1', '1440', ' 30 ']) {
        assert.equal(validateDraft({ enabled: true, rules: [rule('a', 'com.a.b', good)] }).ok, true, `${good} should be accepted`)
    }
})

test('every rule is validated even when time limits are disabled, and all errors are reported', () => {
    const result = validateDraft({ enabled: false, rules: [rule('', 'bad', 'x'), rule('b', 'com.a.b', '5')] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.errors.length, 3)
})

test('applyTimeLimits changes only timeLimits and keeps unknown sections and fields', () => {
    const policy: Policy = {
        version: 9,
        timeLimits: { enabled: false },
        location: { enabled: true, intervalMinutes: 5 },
        restrictions: { blockSafeBoot: true },
        lockSchedule: { enabled: true, windows: [{ days: [1], fromHour: 22, toHour: 7 }] },
        futureSection: { keep: 'me' },
    }
    const updated = applyTimeLimits(policy, { enabled: true, rules: [] })
    assert.deepEqual(updated, { ...policy, timeLimits: { enabled: true, rules: [] } })
    assert.equal((policy.timeLimits as { enabled: boolean }).enabled, false)
})

test('toDraft round-trips through validation, and handles an absent section', () => {
    const policy: Policy = { version: 1, timeLimits: { enabled: true, rules: [{ category: 'g', packages: ['com.a.b'], dailyMinutes: 20 }] } }
    const result = validateDraft(toDraft(policy))
    assert.deepEqual(result, { ok: true, timeLimits: policy.timeLimits })
    assert.deepEqual(toDraft({ version: 0 }), { enabled: false, rules: [] })
})

test('helpers: package parsing, new rule defaults, and the immediate-block warning', () => {
    assert.deepEqual(parsePackages('a.b\n\n  c.d ,a.b'), ['a.b', 'c.d'])
    assert.deepEqual(emptyRule(), { category: '', packages: '', dailyMinutes: '60' })
    assert.equal(blocksImmediately({ enabled: true, rules: [rule('a', 'com.a.b', '0')] }), true)
    assert.equal(blocksImmediately({ enabled: false, rules: [rule('a', 'com.a.b', '0')] }), false)
    assert.equal(blocksImmediately({ enabled: true, rules: [rule('a', 'com.a.b', '10')] }), false)
})
