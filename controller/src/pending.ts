import { t } from './i18n.ts'
import type { MessageKey } from './i18n.ts'

/**
 * Changes waiting out a phone's cooling-off delay (server domain/cooling_off.go). A change that
 * loosens a rule waits; tightening applies at once. This file only words and times them.
 */
export interface PendingChange {
    kind: 'policy' | 'release'
    loosens: string[]
    requestedAt: string
    applyAt: string
}

export const DELAY_CHOICES = [0, 1, 24, 48, 168] as const

const LOOSENS: Record<string, MessageKey> = {
    site_filter: 'pending.loosens.siteFilter',
    chrome: 'pending.loosens.chrome',
    sites: 'pending.loosens.sites',
    time_limits: 'pending.loosens.timeLimits',
    bedtime: 'pending.loosens.bedtime',
    bedtime_apps: 'pending.loosens.bedtimeApps',
    restrictions: 'pending.loosens.restrictions',
    change_delay: 'pending.loosens.changeDelay',
    release: 'pending.loosens.release',
}

/** What the change loosens, as one sentence; an unknown code (a newer server) still reads. */
export function loosensText(codes: string[]): string {
    const parts = codes.map((code) => (LOOSENS[code] ? t(LOOSENS[code]) : code))
    return parts.length === 0 ? t('pending.loosens.release') : parts.join('; ')
}

/** The same, starting with a capital, to open a sentence. */
export function loosensSentence(codes: string[]): string {
    const text = loosensText(codes)
    return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export function delayLabel(hours: number): string {
    if (hours === 0) return t('delay.off')
    if (hours === 1) return t('delay.hour')
    if (hours % 24 === 0) return hours === 24 ? t('delay.day') : t('delay.days', { n: hours / 24 })
    return t('delay.hours', { n: hours })
}

/** "in 23 h 5 min" until the change lands; "any minute" once its time has come. */
export function remainingText(applyAt: string, now: number): string {
    const left = Date.parse(applyAt) - now
    if (!Number.isFinite(left) || left <= 60_000) return t('pending.anyMinute')
    const minutes = Math.ceil(left / 60_000)
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (hours >= 48) return t('pending.inDays', { n: Math.round(hours / 24) })
    if (hours === 0) return t('pending.inMinutes', { m: rest })
    return t('pending.inHours', { h: hours, m: rest })
}

/** The local date and time a change lands, for the parent to plan around. */
export function applyAtText(applyAt: string): string {
    const at = new Date(applyAt)
    return Number.isNaN(at.getTime()) ? '' : at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function queuedText(pending: PendingChange): string {
    return t('pending.queued', { what: loosensText(pending.loosens), when: applyAtText(pending.applyAt) })
}

/** A change was saved or cancelled somewhere on the page: the banner reads the list again. */
const listeners = new Set<() => void>()

export function onPendingChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export function pendingChanged(): void {
    for (const listener of listeners) listener()
}

/** The phone's wait before loosening, in hours; 0 when it has none. */
export function delayHours(policy: Record<string, unknown>): number {
    const delay = policy.changeDelay as { hours?: unknown } | undefined
    return typeof delay?.hours === 'number' ? delay.hours : 0
}

/** Sets the wait; 0 removes the field, which the server reads as no wait. */
export function withDelay<P extends Record<string, unknown>>(policy: P, hours: number): P {
    const { changeDelay: _old, ...rest } = policy
    return (hours > 0 ? { ...rest, changeDelay: { hours } } : rest) as P
}
