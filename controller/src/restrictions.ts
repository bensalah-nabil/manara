import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'
import { t } from './i18n.ts'

/** Each flag maps to a UserManager.DISALLOW_* key set by the agent; the wording follows the agent's own notes on what each covers. */
export const RESTRICTIONS = [
    { key: 'blockVpnConfig', label: t('restrict.vpn'), help: t('restrict.vpnHelp') },
    { key: 'blockPrivateDnsConfig', label: t('restrict.privateDns'), help: t('restrict.privateDnsHelp') },
    { key: 'blockFactoryReset', label: t('restrict.factoryReset'), help: t('restrict.factoryResetHelp') },
    { key: 'blockSafeBoot', label: t('restrict.safeMode'), help: '' },
    { key: 'blockAddUser', label: t('restrict.addUser'), help: '' },
    { key: 'blockDebugging', label: t('restrict.debugging'), help: t('restrict.debuggingHelp') },
    { key: 'blockDateTime', label: t('restrict.dateTime'), help: t('restrict.dateTimeHelp') },
] as const

export type RestrictionKey = (typeof RESTRICTIONS)[number]['key']
export type Draft = Record<RestrictionKey, boolean>

export function toDraft(policy: Policy): Draft {
    const stored = (policy.restrictions ?? {}) as Partial<Record<RestrictionKey, unknown>>
    const draft = {} as Draft
    for (const { key } of RESTRICTIONS) draft[key] = stored[key] === true
    return draft
}

/** Merge into the stored section so fields this console does not edit are kept in the browser's copy. */
export function applyRestrictions(policy: Policy, draft: Draft): Policy {
    const existing = policy.restrictions
    return withSection(policy, 'restrictions', { ...(typeof existing === 'object' && existing !== null ? existing : {}), ...draft })
}

export function activeCount(draft: Draft): number {
    return RESTRICTIONS.filter(({ key }) => draft[key]).length
}
