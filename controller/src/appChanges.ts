import type { Policy } from './policy.ts'
import type { EventItem } from './protection.ts'
import { dateLocale, t } from './i18n.ts'

/**
 * Apps installed or removed on the phone (roadmap W1), sent only while the parent has
 * `appChanges` on, and listed on the child's notice while it is. Name and time, never content.
 */
export interface AppChangeItem {
    id: string
    action: 'installed' | 'removed'
    packageName: string
    label: string
    occurredAt: string
}

export interface Draft {
    enabled: boolean
}

/** At most this many in the console; the server keeps 30 days. */
export const MAX_SHOWN = 100

export function toDraft(policy: Policy): Draft {
    const section = policy.appChanges as { enabled?: unknown } | undefined
    return { enabled: section?.enabled === true }
}

export function applyAppChanges(policy: Policy, draft: Draft): Policy {
    return { ...policy, appChanges: { enabled: draft.enabled } }
}

/** The list's changes: the newest [MAX_SHOWN] of [parseAppChanges]. */
export function summarizeAppChanges(events: EventItem[]): AppChangeItem[] {
    return parseAppChanges(events).slice(0, MAX_SHOWN)
}

/** Every change, newest first, for counting; a malformed event, another kind, or one seen twice is left out. */
export function parseAppChanges(events: EventItem[]): AppChangeItem[] {
    const seen = new Set<string>()
    const items: AppChangeItem[] = []
    for (const event of events) {
        if (event.kind !== 'app_change' || seen.has(event.id) || Number.isNaN(Date.parse(event.occurredAt))) continue
        const payload = event.payload ?? {}
        const action = payload.action
        const packageName = payload.package
        if ((action !== 'installed' && action !== 'removed') || typeof packageName !== 'string' || packageName === '') continue
        const label = typeof payload.label === 'string' && payload.label.trim() !== '' ? payload.label.trim() : packageName
        seen.add(event.id)
        items.push({ id: event.id, action, packageName, label, occurredAt: event.occurredAt })
    }
    items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    return items
}

export function actionText(item: AppChangeItem): string {
    return item.action === 'installed' ? t('appChanges.installed') : t('appChanges.removed')
}

export function whenText(occurredAt: string): string {
    return new Date(occurredAt).toLocaleString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
