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
    location: 'Location sharing',
    'site-filter': 'Site filtering',
    'time-limit': 'App time limits',
    restrictions: 'Settings restrictions',
    lock: 'Scheduled lock',
    'usage-report': 'Usage reporting',
    browser: 'Chrome rules',
}

const DETAILS: Record<string, string> = {
    usage_access: 'Usage Access is turned off, so app usage cannot be measured.',
    device_location_on: 'The phone\'s Location setting is off.',
    location_permission: 'Manara is not allowed to read the phone\'s location.',
    private_dns_host: 'Private DNS is not set to the filtering server.',
    host_not_serving: 'The phone could not use the filtering host (it did not answer as a Private DNS server). Check the host name.',
    failure_setting: 'The phone could not apply the filtering host.',
    disallow_config_vpn: 'VPN settings are no longer locked.',
    disallow_config_private_dns: 'Private DNS settings are no longer locked.',
    disallow_factory_reset: 'Factory reset is no longer blocked.',
    disallow_safe_boot: 'Safe boot is no longer blocked.',
    disallow_add_user: 'Adding users is no longer blocked.',
    disallow_debugging_features: 'Developer options are no longer blocked.',
    // The values the phone actually reports (Android's UserManager constants).
    no_config_vpn: 'VPN settings are no longer locked.',
    no_factory_reset: 'Factory reset is no longer blocked.',
    no_safe_boot: 'Safe boot is no longer blocked.',
    no_add_user: 'Adding users is no longer blocked.',
    no_debugging_features: 'Developer options are no longer blocked.',
    no_config_date_time: 'Date and time settings are no longer locked.',
}

const RESTORED_TEXT = 'Back in effect.'

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
            title: ENFORCERS[enforcer] ?? (enforcer || 'Unknown protection'),
            detail: restored ? RESTORED_TEXT : (DETAILS[detail] ?? (detail || 'A problem was reported.')),
            reportedAt: event.occurredAt,
        })
    }

    return reports.sort((a, b) => {
        if (a.state !== b.state) return a.state === 'attention' ? -1 : 1
        return Date.parse(b.reportedAt) - Date.parse(a.reportedAt)
    })
}
