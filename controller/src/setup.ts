import { t } from './i18n.ts'
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
    { key: 'linked', label: t('setup.step.linked') },
    { key: 'pairing', label: t('setup.step.pairing') },
    { key: 'checking_accounts', label: t('setup.step.checking') },
    { key: 'waiting_for_accounts', label: t('setup.step.waiting') },
    { key: 'removing_app_accounts', label: t('setup.step.pausing') },
    { key: 'device_owner', label: t('setup.step.owner') },
    { key: 'restoring_apps', label: t('setup.step.restoring') },
    { key: 'reconnecting', label: t('setup.step.reconnecting') },
    { key: 'done', label: t('setup.step.done') },
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
    'com.osp.app.signin': t('setup.account.samsung'),
    'com.xiaomi': t('setup.account.xiaomi'),
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

/** About three missed heartbeats (SetupRunner.HEARTBEAT_MILLIS, 60 s on the phone). */
export const PHONE_QUIET_MS = 3 * 60_000

/**
 * A setup still under way whose phone stopped sending updates: turned off, or restarted (seen on the
 * SM-A045F, in the reconnect step). What the page shows may be out of date.
 */
export function phoneQuiet(setup: Pick<DeviceSetup, 'status' | 'updatedAt'>, now: number): boolean {
    const at = Date.parse(setup.updatedAt)
    return isActive(setup) && !Number.isNaN(at) && now - at > PHONE_QUIET_MS
}

/** The phone waits for the parent to pair it, from this console (ADR-0005). */
export function waitingToPair(setup: Pick<DeviceSetup, 'step' | 'status' | 'pairingQr'>): boolean {
    return setup.step === 'pairing' && setup.status === 'waiting_for_parent' && !!setup.pairingQr
}

/**
 * The phone is managed and waits while the parent signs back in to the accounts they want. The
 * server finishes at once, phone or not; a run stuck from before that (the phone was off and never
 * read the request) can be finished again.
 */
export function canFinish(setup: Pick<DeviceSetup, 'step' | 'status'>): boolean {
    return setup.step === 'reconnecting' && setup.status === 'waiting_for_parent'
}

/** The six digits from "Pair device with pairing code", spaces allowed; null if it isn't that. */
export function pairingCode(text: string): string | null {
    const digits = text.replace(/\s+/g, '')
    return /^[0-9]{6}$/.test(digits) ? digits : null
}

/** One way back in to an account after setup, as the console shows it before the parent removes it. */
export type SignBackInWay = { text: string; link?: { href: string; label: string } }

/**
 * How a parent gets back in to each kind of account without remembering its password. Google is
 * the one that matters: on phones that count stored accounts (Samsung, ADR-0006) it must be
 * removed and signed back in to; apps like Facebook re-created theirs by themselves (SM-A045F).
 */
export function signBackInWays(type: string): SignBackInWay[] {
    if (type === 'com.google') {
        return [
            {
                text: t('setup.way.passkey'),
                link: { href: 'https://g.co/passkeys', label: t('setup.way.passkeyLink') },
            },
            {
                text: t('setup.way.sms'),
                link: { href: 'https://myaccount.google.com/signinoptions/rescuephone', label: t('setup.way.smsLink') },
            },
            {
                text: t('setup.way.familyLink'),
                link: { href: 'https://support.google.com/families/answer/7103262', label: t('setup.way.familyLinkLink') },
            },
        ]
    }
    return [{ text: t('setup.way.other') }]
}
