import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAYS, applySchedule, describeWindow, emptyWindow, hourText, toDraft, validateDraft } from './schedule.ts'
import type { Policy } from './policy.ts'

test('days use the agent numbering: Sunday is 1 and Saturday is 7', () => {
    assert.deepEqual(DAYS.map((day) => day.value), [1, 2, 3, 4, 5, 6, 7])
    assert.equal(DAYS[0].label, 'Sun')
    assert.equal(DAYS[6].label, 'Sat')
})

test('a valid draft is normalized: days sorted and unique', () => {
    const result = validateDraft({ enabled: true, windows: [{ days: [7, 1, 7], fromHour: 22, toHour: 7 }] })
    assert.deepEqual(result, { ok: true, schedule: { enabled: true, windows: [{ days: [1, 7], fromHour: 22, toHour: 7 }] } })
})

test('a window needs at least one day', () => {
    const result = validateDraft({ enabled: true, windows: [{ days: [], fromHour: 22, toHour: 7 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors[0], /Window 1: choose at least one day/)
})

test('equal start and end hours are rejected, since the agent never locks for them', () => {
    const result = validateDraft({ enabled: true, windows: [{ days: [1], fromHour: 9, toHour: 9 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors[0], /never lock/)
})

test('hours must be whole numbers from 0 to 23, and days from 1 to 7', () => {
    for (const [fromHour, toHour] of [[-1, 5], [5, 24], [1.5, 3], [Number.NaN, 3]]) {
        assert.equal(validateDraft({ enabled: true, windows: [{ days: [1], fromHour, toHour }] }).ok, false, `${fromHour}-${toHour}`)
    }
    assert.equal(validateDraft({ enabled: true, windows: [{ days: [0], fromHour: 1, toHour: 2 }] }).ok, false)
    assert.equal(validateDraft({ enabled: true, windows: [{ days: [8], fromHour: 1, toHour: 2 }] }).ok, false)
    assert.equal(validateDraft({ enabled: true, windows: [{ days: [1], fromHour: 0, toHour: 23 }] }).ok, true)
})

test('every window is checked and all problems reported; no windows is valid', () => {
    const result = validateDraft({ enabled: true, windows: [{ days: [], fromHour: 1, toHour: 1 }, { days: [1], fromHour: 5, toHour: 5 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.errors.length, 3)
    assert.deepEqual(validateDraft({ enabled: false, windows: [] }), { ok: true, schedule: { enabled: false, windows: [] } })
})

test('toDraft copies the stored schedule and handles an absent section', () => {
    const policy: Policy = { version: 1, lockSchedule: { enabled: true, windows: [{ days: [1], fromHour: 22, toHour: 7 }] } }
    const draft = toDraft(policy)
    assert.deepEqual(draft, { enabled: true, windows: [{ days: [1], fromHour: 22, toHour: 7 }] })
    draft.windows[0].days.push(2)
    assert.deepEqual((policy.lockSchedule as { windows: { days: number[] }[] }).windows[0].days, [1])
    assert.deepEqual(toDraft({ version: 0 }), { enabled: false, windows: [] })
})

test('applySchedule changes only lockSchedule and keeps unknown sections', () => {
    const policy: Policy = { version: 3, location: { enabled: true }, timeLimits: { enabled: true }, future: { keep: 1 } }
    assert.deepEqual(applySchedule(policy, { enabled: false, windows: [] }), { ...policy, lockSchedule: { enabled: false, windows: [] } })
})

test('descriptions and defaults', () => {
    assert.equal(hourText(7), '07:00')
    assert.equal(describeWindow({ days: [7, 1], fromHour: 22, toHour: 7 }), 'Sun, Sat 22:00 to 07:00 (ends the next morning)')
    assert.equal(describeWindow({ days: [3], fromHour: 13, toHour: 15 }), 'Tue 13:00 to 15:00')
    assert.deepEqual(emptyWindow(), { days: [], fromHour: 22, toHour: 7 })
})
