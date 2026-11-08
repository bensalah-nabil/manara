import type { Policy } from './policy.ts'
import { withSection } from './policy.ts'

/** Each flag maps to a UserManager.DISALLOW_* key set by the agent; the wording follows the agent's own notes on what each covers. */
export const RESTRICTIONS = [
    { key: 'blockVpnConfig', label: 'Block VPN settings', help: 'Also stops the child starting their own VPN.' },
    { key: 'blockPrivateDnsConfig', label: 'Block Private DNS settings', help: 'Needs Android 10 or newer; ignored on older phones.' },
    { key: 'blockFactoryReset', label: 'Block factory reset from Settings', help: 'Covers the Settings reset only, not necessarily recovery mode.' },
    { key: 'blockSafeBoot', label: 'Block safe mode', help: '' },
    { key: 'blockAddUser', label: 'Block adding users', help: '' },
    { key: 'blockDebugging', label: 'Block developer options and debugging', help: 'Stops a computer being used to undo these rules. Waits until guided setup has finished.' },
    { key: 'blockDateTime', label: 'Lock the date and time', help: "Keeps the clock automatic, so changing it can't escape a lock window or reset a daily limit." },
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
