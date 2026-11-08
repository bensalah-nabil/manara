export type SetupStepKey =
    | 'linked'
    | 'pairing'
    | 'checking_accounts'
    | 'removing_app_accounts'
    | 'waiting_for_accounts'
    | 'device_owner'
    | 'restoring_apps'
    | 'reconnecting'
    | 'done'

export type SetupStatus = 'in_progress' | 'waiting_for_parent' | 'failed' | 'done'

export interface SetupAccount {
    type: string
    name: string
}

export interface DeviceSetup {
    deviceId: string
    step: SetupStepKey
    status: SetupStatus
    message: string
    initialAccounts: SetupAccount[]
    currentAccounts: SetupAccount[]
    startedAt: string
    updatedAt: string
    /** What the phone's "Pair device with QR code" scans; only while it waits to pair. */
    pairingQr?: string
    /** The parent chose Finish setup and the phone hasn't ended yet. */
    finishRequested: boolean
}

/** Same order as domain.SetupSteps on the server. */
export const SETUP_STEPS: { key: SetupStepKey; label: string }[] = [
    { key: 'linked', label: 'Phone linked to your account' },
    { key: 'pairing', label: 'Wireless debugging paired' },
    { key: 'checking_accounts', label: 'Accounts on the phone checked' },
    { key: 'waiting_for_accounts', label: 'Google, Samsung and other accounts removed' },
    { key: 'removing_app_accounts', label: 'Apps with an account saved and removed (done last)' },
    { key: 'device_owner', label: 'Manara made the phone manager' },
    { key: 'restoring_apps', label: 'Apps put back' },
    { key: 'reconnecting', label: 'Accounts signed back in' },
    { key: 'done', label: 'Setup finished' },
]

export type StepState = 'done' | 'current' | 'waiting' | 'failed' | 'pending'

export function stepStates(setup: Pick<DeviceSetup, 'step' | 'status'>): { key: SetupStepKey; label: string; state: StepState }[] {
    const current = SETUP_STEPS.findIndex((s) => s.key === setup.step)
    return SETUP_STEPS.map((step, index) => {
        let state: StepState = 'pending'
        if (current === -1) state = 'pending'
        else if (setup.status === 'done' || index < current) state = 'done'
        else if (index === current) {
            state = setup.status === 'failed' ? 'failed' : setup.status === 'waiting_for_parent' ? 'waiting' : 'current'
        }
        return { ...step, state }
    })
}

/** The parent's reconnect checklist: every account the phone had at the start, ticked once it is back. */
export function reconnectChecklist(setup: Pick<DeviceSetup, 'initialAccounts' | 'currentAccounts'>): (SetupAccount & { back: boolean })[] {
    const present = new Set(setup.currentAccounts.map(key))
    const seen = new Set<string>()
    const list: (SetupAccount & { back: boolean })[] = []
    for (const account of setup.initialAccounts) {
        if (seen.has(key(account))) continue
        seen.add(key(account))
        list.push({ ...account, back: present.has(key(account)) })
    }
    return list
}

function key(account: SetupAccount): string {
    return `${account.type}\n${account.name}`
}

const ACCOUNT_TYPES: Record<string, string> = {
    'com.google': 'Google',
    'com.osp.app.signin': 'Samsung account',
    'com.xiaomi': 'Xiaomi account',
    'com.whatsapp': 'WhatsApp',
    'com.facebook.auth.login': 'Facebook',
    'www.instagram.com': 'Instagram',
    'com.twitter.android.auth.login': 'X (Twitter)',
}

export function accountTypeName(type: string): string {
    return ACCOUNT_TYPES[type] ?? type
}

export function isActive(setup: Pick<DeviceSetup, 'status'>): boolean {
    return setup.status === 'in_progress' || setup.status === 'waiting_for_parent'
}

/** The phone waits for the parent to pair it, from this console (ADR-0005). */
export function waitingToPair(setup: Pick<DeviceSetup, 'step' | 'status' | 'pairingQr'>): boolean {
    return setup.step === 'pairing' && setup.status === 'waiting_for_parent' && !!setup.pairingQr
}

/** The phone is managed and waits while the parent signs back in to the accounts they want. */
export function canFinish(setup: Pick<DeviceSetup, 'step' | 'status' | 'finishRequested'>): boolean {
    return setup.step === 'reconnecting' && setup.status === 'waiting_for_parent' && !setup.finishRequested
}

/** The six digits from "Pair device with pairing code", spaces allowed; null if it isn't that. */
export function pairingCode(text: string): string | null {
    const digits = text.replace(/\s+/g, '')
    return /^[0-9]{6}$/.test(digits) ? digits : null
}
