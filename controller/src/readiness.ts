import type { SetupReadiness } from './api.ts'

export type LineState = 'ok' | 'missing' | 'unknown'

export interface ReadinessLine {
    key: 'android' | 'wifi' | 'battery' | 'developerOptions' | 'wirelessDebugging'
    state: LineState
    /** Battery is advice: setup works on a low battery, it just mustn't run out. */
    required: boolean
}

/** Below this, and not charging, the phone asks to plug in. Same as the phone's SetupReadiness.MIN_BATTERY. */
export const MIN_BATTERY = 50

/** The phone resends every 30 s while its waiting screen is open; three missed means it's closed or off. */
export const READINESS_QUIET_MS = 90_000

function state(value: boolean | null | undefined): LineState {
    return value === true ? 'ok' : value === false ? 'missing' : 'unknown'
}

/** The same five lines, in the same order, as the phone's own waiting screen. */
export function readinessLines(r: SetupReadiness): ReadinessLine[] {
    const battery: LineState = r.charging ? 'ok'
        : r.batteryPercent === null || r.batteryPercent === undefined ? 'unknown'
        : r.batteryPercent >= MIN_BATTERY ? 'ok' : 'missing'
    return [
        { key: 'android', state: r.android ? 'ok' : 'missing', required: true },
        { key: 'wifi', state: state(r.wifi), required: true },
        { key: 'battery', state: battery, required: false },
        { key: 'developerOptions', state: state(r.developerOptions), required: true },
        { key: 'wirelessDebugging', state: state(r.wirelessDebugging), required: true },
    ]
}

/** The phone stopped sending: its waiting screen was left, or it is off. */
export function readinessQuiet(r: Pick<SetupReadiness, 'updatedAt'>, now: number): boolean {
    const at = Date.parse(r.updatedAt)
    return !Number.isNaN(at) && now - at > READINESS_QUIET_MS
}
