import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { agoText, deviceName, errorText, lastSeenText } from './format.ts'
import { PairPhone } from './PairPhone.tsx'
import { accountTypeName, canFinish, isActive, reconnectChecklist, stepStates, waitingToPair } from './setup.ts'
import type { DeviceSetup, SetupAccount, SetupStepKey, StepState } from './setup.ts'

/** While the phone works, the console looks every 2 s; after a failure, every 5 s, to notice a new run. */
const LIVE_MS = 2000
const FAILED_MS = 5000

const STATE_TEXT: Record<StepState, string> = {
    done: 'Done',
    current: 'In progress',
    waiting: 'Waiting for you',
    failed: 'Stopped',
    pending: '',
}

function secondsAgo(iso: string, now: number): string {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
    if (Number.isNaN(seconds)) return ''
    if (seconds < 5) return 'just now'
    if (seconds < 60) return `${seconds} s ago`
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? `${minutes} min ago` : lastSeenText(iso)
}

function Accounts({ accounts }: { accounts: SetupAccount[] }) {
    return (
        <ul class="reports">
            {accounts.map((account) => (
                <li key={`${account.type}\n${account.name}`}>
                    <strong>{accountTypeName(account.type)}</strong>
                    <span>{account.name}</span>
                </li>
            ))}
        </ul>
    )
}

/**
 * Guided setup as a live timeline: each step in order, and under the step the phone is on, what
 * that step needs from the parent (the pairing QR code or code box, the accounts to remove, the
 * accounts to sign back in to and Finish). It follows the phone by itself.
 */
export function SetupProgress({ api, device, onSessionExpired, onSetup }: Props & { onSetup?: (setup: DeviceSetup | null) => void }) {
    const [setup, setSetup] = useState<DeviceSetup | null | undefined>(undefined)
    const [error, setError] = useState('')
    const [tick, setTick] = useState(0)
    const [now, setNow] = useState(() => Date.now())
    const [clearing, setClearing] = useState(false)
    const [finishing, setFinishing] = useState(false)

    useEffect(() => {
        let current = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const again = (ms: number) => { timer = setTimeout(() => setTick((count) => count + 1), ms) }
        api
            .getSetup(device.deviceId)
            .then((value) => {
                if (!current) return
                setSetup(value)
                onSetup?.(value)
                setError('')
                if (value && isActive(value)) again(LIVE_MS)
                else if (value?.status === 'failed') again(FAILED_MS)
            })
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else {
                    setError(errorText(caught))
                    again(FAILED_MS)
                }
            })
        return () => {
            current = false
            if (timer) clearTimeout(timer)
        }
    }, [api, device.deviceId, onSessionExpired, onSetup, tick])

    const live = !!setup && isActive(setup)
    useEffect(() => {
        if (!live) return
        const clock = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(clock)
    }, [live])

    async function clearAccounts() {
        if (!window.confirm('Delete the saved list of accounts? You will no longer see which accounts to sign back in to.')) return
        setClearing(true)
        try {
            await api.clearSetupAccounts(device.deviceId)
            setTick((count) => count + 1)
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setClearing(false)
        }
    }

    async function finish() {
        setFinishing(true)
        try {
            await api.finishSetup(device.deviceId)
            setTick((count) => count + 1)
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setFinishing(false)
        }
    }

    // Phones set up before the guided flow never report, so they show nothing here.
    if (!setup) return error ? <p role="alert" class="error">{error}</p> : null

    const checklist = reconnectChecklist(setup)
    const message = setup.message && <p role="status" class="notice">Phone: {setup.message}</p>

    const shown = setup
    /** What the step the phone is on needs, shown right under it. */
    function detail(key: SetupStepKey, state: StepState): ComponentChildren {
        if (state === 'failed') {
            return (
                <>
                    {message}
                    <p>
                        Setup stopped here. Nothing more is removed, and Manara puts back any app it had removed. The list of
                        what was on the phone is kept below. When you're ready, start guided setup again in Manara on the
                        phone: this page follows the new run by itself.
                    </p>
                    {checklist.length > 0 && <><strong>What was on the phone</strong><Accounts accounts={checklist} /></>}
                </>
            )
        }
        if (state !== 'current' && state !== 'waiting') return null
        switch (key) {
            case 'pairing':
                return waitingToPair(shown) && shown.pairingQr ? (
                    <>
                        {/* The phone's opening instruction repeats the panel below; anything newer (a failed code) is shown. */}
                        {!shown.message.startsWith('On the phone, in Wireless debugging') && message}
                        <PairPhone api={api} deviceId={device.deviceId} qr={shown.pairingQr} onSessionExpired={onSessionExpired} />
                    </>
                ) : message
            case 'waiting_for_accounts':
                return (
                    <>
                        {message}
                        {shown.currentAccounts.length > 0 && (
                            <>
                                {!shown.message && (
                                    <p class="untested">
                                        On the phone, open Settings, then Accounts, and remove each account below. Write down each
                                        password first: you need it to sign back in.
                                    </p>
                                )}
                                <strong>Still on the phone ({shown.currentAccounts.length})</strong>
                                <Accounts accounts={shown.currentAccounts} />
                                <p class="hint">This list updates by itself as you remove accounts.</p>
                            </>
                        )}
                    </>
                )
            case 'reconnecting':
                return (
                    <>
                        {state === 'current' ? (
                            // The phone is checking by itself that the paused apps' accounts came back.
                            message
                        ) : (
                            <p>Manara now manages the phone. Sign back in only to the accounts you removed and want to keep on it; you don't need all of them.</p>
                        )}
                        <ul class="reports">
                            {checklist.map((account) => (
                                <li key={`${account.type}\n${account.name}`} class={account.back ? 'restored' : undefined}>
                                    <strong>{account.back ? 'Back on the phone' : 'Not yet'}: {accountTypeName(account.type)}</strong>
                                    <span>{account.name}</span>
                                </li>
                            ))}
                        </ul>
                        {state === 'waiting' && (
                            <>
                                <button type="button" class="primary" onClick={finish} disabled={finishing || !canFinish(shown)}>
                                    {shown.finishRequested ? 'Finishing...' : finishing ? 'Sending...' : 'Finish setup'}
                                </button>
                                <p class="hint">Finish when the accounts you want are back. You can sign in to others later.</p>
                            </>
                        )}
                    </>
                )
            default:
                return message
        }
    }

    const done = setup.status === 'done'
    const body = (
        <div class="stack">
            {!done && (
                <div class="consent">
                    <h3>This is your child's phone: {deviceName(device)}</h3>
                    <p>Everything below is happening on that phone. Make sure it is your child's phone, not your own.</p>
                </div>
            )}
            <div class="timeline-head">
                <strong>Setup</strong>
                {live ? (
                    <span class="live"><span class="live-dot" aria-hidden="true" />Live · phone updated {secondsAgo(setup.updatedAt, now)}</span>
                ) : (
                    <span class="hint">Last update from the phone {lastSeenText(setup.updatedAt)}</span>
                )}
            </div>
            <ol class="timeline">
                {stepStates(setup).map((step, index) => {
                    const more = detail(step.key, step.state)
                    return (
                        <li key={step.key} class={`tl-step ${step.state}`} aria-current={step.state === 'current' || step.state === 'waiting' ? 'step' : undefined}>
                            <span class="tl-marker" aria-hidden="true">
                                {step.state === 'done' ? '✓' : step.state === 'failed' ? '!' : index + 1}
                            </span>
                            <div class="tl-body">
                                <div class="tl-title">
                                    <span>{step.label}</span>
                                    {STATE_TEXT[step.state] && <span class={`tl-state ${step.state}`}>{STATE_TEXT[step.state]}</span>}
                                </div>
                                {more && <div class="tl-detail stack">{more}</div>}
                            </div>
                        </li>
                    )
                })}
            </ol>
            {setup.status === 'done' && checklist.length > 0 && (
                <details>
                    <summary>Accounts that were on the phone ({checklist.length})</summary>
                    <ul class="reports">
                        {checklist.map((account) => (
                            <li key={`${account.type}\n${account.name}`} class={account.back ? 'restored' : undefined}>
                                <strong>{account.back ? 'Back on the phone' : 'Not signed back in'}: {accountTypeName(account.type)}</strong>
                                <span>{account.name}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {error && <p role="alert" class="error">{error}</p>}

            {setup.initialAccounts.length > 0 && (
                <div class="stack">
                    <p class="hint">
                        Manara keeps the account names and types (never passwords) for 7 days, so you can see what to sign
                        back in to. You can delete them sooner.
                    </p>
                    <button type="button" onClick={clearAccounts} disabled={clearing}>
                        {clearing ? 'Deleting...' : 'Delete saved account list'}
                    </button>
                </div>
            )}
        </div>
    )
    // Once the phone is set up, the timeline is history: one closed line, opened only on demand.
    if (!done) return body
    return (
        <details class="setup-done">
            <summary title={lastSeenText(setup.updatedAt)}>✓ Guided setup finished {agoText(setup.updatedAt)}</summary>
            {body}
        </details>
    )
}
