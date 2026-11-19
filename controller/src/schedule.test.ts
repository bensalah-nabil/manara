import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAYS, MAX_ALLOWED_APPS, PRAYER_APPS, QURAN_APPS, applySchedule, emptyWindow, hourText, toDraft, validateDraft, withPrayerApps } from './schedule.ts'
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

test('equal start and end hours are rejected, since such a window never applies', () => {
    const result = validateDraft({ enabled: true, windows: [{ days: [1], fromHour: 9, toHour: 9 }] })
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors[0], /never apply/)
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
    assert.deepEqual(draft, { enabled: true, windows: [{ days: [1], fromHour: 22, toHour: 7 }], allowedApps: '' })
    draft.windows[0].days.push(2)
    assert.deepEqual((policy.lockSchedule as { windows: { days: number[] }[] }).windows[0].days, [1])
    assert.deepEqual(toDraft({ version: 0 }), { enabled: false, windows: [], allowedApps: '' })
})

test('applySchedule changes only lockSchedule and keeps unknown sections', () => {
    const policy: Policy = { version: 3, location: { enabled: true }, timeLimits: { enabled: true }, future: { keep: 1 } }
    assert.deepEqual(applySchedule(policy, { enabled: false, windows: [] }), { ...policy, lockSchedule: { enabled: false, windows: [] } })
})

test('hours and defaults', () => {
    assert.equal(hourText(7), '07:00')
    assert.deepEqual(emptyWindow(), { days: [], fromHour: 22, toHour: 7 })
})

test('the apps that stay open at bedtime round-trip through the draft', () => {
    const policy: Policy = { version: 3, lockSchedule: { enabled: true, windows: [{ days: [1], fromHour: 21, toHour: 7 }], allowedApps: ['com.kanout.mawaqit', 'com.athan'] } }
    const draft = toDraft(policy)
    assert.equal(draft.allowedApps, 'com.kanout.mawaqit\ncom.athan')
    const result = validateDraft(draft)
    assert.ok(result.ok)
    if (result.ok) assert.deepEqual(applySchedule(policy, result.schedule).lockSchedule, policy.lockSchedule)
})

test('the allowed apps are de-duplicated, and an empty list is left out', () => {
    const result = validateDraft({ enabled: true, windows: [], allowedApps: 'com.athan, com.athan\n\n' })
    assert.deepEqual(result, { ok: true, schedule: { enabled: true, windows: [], allowedApps: ['com.athan'] } })
    assert.deepEqual(validateDraft({ enabled: true, windows: [], allowedApps: '  ' }), { ok: true, schedule: { enabled: true, windows: [] } })
})

test('an allowed app must be a package name, and the list stays short', () => {
    const named = validateDraft({ enabled: true, windows: [], allowedApps: 'Mawaqit' })
    assert.equal(named.ok, false)
    if (!named.ok) assert.match(named.errors[0], /"Mawaqit" is not a package name/)
    const many = Array.from({ length: MAX_ALLOWED_APPS + 1 }, (_, i) => `com.example.app${i}`).join('\n')
    const long = validateDraft({ enabled: true, windows: [], allowedApps: many })
    assert.equal(long.ok, false)
    if (!long.ok) assert.match(long.errors[0], /At most 50 apps/)
})

test('adding the prayer-time apps keeps what the parent wrote and adds each once', () => {
    const text = withPrayerApps('com.greentech.quran\ncom.kanout.mawaqit')
    const apps = text.split('\n')
    assert.equal(apps[0], 'com.greentech.quran')
    assert.equal(apps.filter((app) => app === 'com.kanout.mawaqit').length, 1)
    assert.ok(PRAYER_APPS.every((app) => apps.includes(app)))
    assert.ok(QURAN_APPS.every((app) => apps.includes(app)))
    assert.equal(withPrayerApps(text), text)
})
