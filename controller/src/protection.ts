import { t } from './i18n.ts'
export interface EventItem {
    id: string
    kind: string
    occurredAt: string
    payload?: Record<string, unknown>
}

export type ProtectionState = 'attention' | 'restored'

export interface ProtectionReport {
    key: string
    state: ProtectionState
    title: string
    detail: string
    reportedAt: string
}

const ENFORCERS: Record<string, string> = {
    location: t('protection.enforcer.location'),
    'site-filter': t('protection.enforcer.siteFilter'),
    'time-limit': t('protection.enforcer.timeLimit'),
    restrictions: t('protection.enforcer.restrictions'),
    lock: t('protection.enforcer.lock'),
    'usage-report': t('protection.enforcer.usageReport'),
    browser: t('protection.enforcer.browser'),
}

const DETAILS: Record<string, string> = {
    usage_access: t('protection.detail.usageAccess'),
    device_location_on: t('protection.detail.locationOff'),
    location_permission: t('protection.detail.locationPermission'),
    private_dns_host: t('protection.detail.privateDns'),
    host_not_serving: t('protection.detail.hostNotServing'),
    failure_setting: t('protection.detail.failureSetting'),
    disallow_config_vpn: t('protection.detail.vpn'),
    disallow_config_private_dns: t('protection.detail.privateDnsLock'),
    disallow_factory_reset: t('protection.detail.factoryReset'),
    disallow_safe_boot: t('protection.detail.safeBoot'),
    disallow_add_user: t('protection.detail.addUser'),
    disallow_debugging_features: t('protection.detail.debugging'),
    // The values the phone actually reports (Android's UserManager constants).
    no_config_vpn: t('protection.detail.vpn'),
    no_factory_reset: t('protection.detail.factoryReset'),
    no_safe_boot: t('protection.detail.safeBoot'),
    no_add_user: t('protection.detail.addUser'),
    no_debugging_features: t('protection.detail.debugging'),
    no_config_date_time: t('protection.detail.dateTime'),
}

const RESTORED_TEXT = t('protection.backInEffect')

function text(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

/** One entry per (protection, detail): its newest report wins, unresolved problems first. */
/**
 * [notBefore]: when guided setup finished. Earlier reports come from before Manara managed the
 * phone, when every rule fails with SecurityException; they say nothing about protection now.
 */
export function summarizeProtection(events: EventItem[], notBefore = 0): ProtectionReport[] {
    const latest = new Map<string, { time: number; event: EventItem }>()

    for (const event of events) {
        if (event.kind !== 'enforcement') continue
        const status = text(event.payload?.status)
        if (status !== 'missing' && status !== 'failed' && status !== 'restored') continue
        const time = Date.parse(event.occurredAt)
        if (Number.isNaN(time) || time < notBefore) continue
        const key = `${text(event.payload?.enforcer)}|${text(event.payload?.detail)}`
        const seen = latest.get(key)
        if (!seen || time > seen.time) latest.set(key, { time, event })
    }

    const reports: ProtectionReport[] = []
    for (const [key, { event }] of latest) {
        const enforcer = text(event.payload?.enforcer)
        const detail = text(event.payload?.detail)
        const restored = event.payload?.status === 'restored'
        reports.push({
            key,
            state: restored ? 'restored' : 'attention',
            title: ENFORCERS[enforcer] ?? (enforcer || t('protection.unknown')),
            detail: restored ? RESTORED_TEXT : (DETAILS[detail] ?? (detail || t('protection.problem'))),
            reportedAt: event.occurredAt,
        })
    }

    return reports.sort((a, b) => {
        if (a.state !== b.state) return a.state === 'attention' ? -1 : 1
        return Date.parse(b.reportedAt) - Date.parse(a.reportedAt)
    })
}
