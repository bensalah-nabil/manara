import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import { t } from './i18n.ts'

export interface UsageReportPolicy {
    enabled: boolean
}

export interface Draft {
    enabled: boolean
}

export function toDraft(policy: Policy): Draft {
    const section = policy.usageReport as UsageReportPolicy | undefined
    return { enabled: section?.enabled === true }
}

export function applyUsageReport(policy: Policy, section: UsageReportPolicy): Policy {
    return withSection(policy, 'usageReport', section)
}

export const USAGE_REPORT_WARNING =
    t('usage.warning')
