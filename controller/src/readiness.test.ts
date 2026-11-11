import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SetupReadiness } from './api.ts'
import { brandFromManufacturer } from './enrollment.ts'
import { readinessLines, readinessQuiet } from './readiness.ts'

const ready: SetupReadiness = {
    android: true, wifi: true, batteryPercent: 80, charging: false, developerOptions: true, wirelessDebugging: true,
    ready: true, updatedAt: '2026-11-11T10:00:00Z',
}
const stateOf = (r: SetupReadiness, key: string) => readinessLines(r).find((l) => l.key === key)!.state

test('the console shows the same five lines as the phone, in order', () => {
    assert.deepEqual(readinessLines(ready).map((l) => l.key), ['android', 'wifi', 'battery', 'developerOptions', 'wirelessDebugging'])
    assert.ok(readinessLines(ready).every((l) => l.state === 'ok'))
})

test('a low battery is advice; plugged in counts as fine', () => {
    assert.equal(stateOf({ ...ready, batteryPercent: 20 }, 'battery'), 'missing')
    assert.equal(readinessLines(ready).find((l) => l.key === 'battery')!.required, false)
    assert.equal(stateOf({ ...ready, batteryPercent: 20, charging: true }, 'battery'), 'ok')
    assert.equal(stateOf({ ...ready, batteryPercent: null }, 'battery'), 'unknown')
})

test("a setting the phone wouldn't report is shown as unknown, not as missing", () => {
    assert.equal(stateOf({ ...ready, wirelessDebugging: null }, 'wirelessDebugging'), 'unknown')
    assert.equal(stateOf({ ...ready, developerOptions: false }, 'developerOptions'), 'missing')
})

test('the checklist is called quiet after three missed reports', () => {
    const at = Date.parse(ready.updatedAt)
    assert.equal(readinessQuiet(ready, at + 60_000), false)
    assert.equal(readinessQuiet(ready, at + 120_000), true)
})

test("the phone's own maker picks the guide", () => {
    assert.equal(brandFromManufacturer('samsung'), 'samsung')
    assert.equal(brandFromManufacturer('Samsung'), 'samsung')
    assert.equal(brandFromManufacturer('Xiaomi'), 'xiaomi')
    assert.equal(brandFromManufacturer('Redmi'), 'xiaomi')
    assert.equal(brandFromManufacturer('POCO'), 'xiaomi')
    assert.equal(brandFromManufacturer('realme'), 'oppo-realme')
    assert.equal(brandFromManufacturer('OPPO'), 'oppo-realme')
    assert.equal(brandFromManufacturer('Google'), 'google')
    assert.equal(brandFromManufacturer('motorola'), 'motorola')
    assert.equal(brandFromManufacturer('TECNO'), 'other')
    assert.equal(brandFromManufacturer(undefined), 'other')
})
