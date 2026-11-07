import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { deviceName, errorText, lastSeenText } from './format.ts'
import { PairPhone } from './PairPhone.tsx'
import { accountTypeName, canFinish, isActive, reconnectChecklist, stepStates, waitingToPair } from './setup.ts'
import type { DeviceSetup, StepState } from './setup.ts'

const REFRESH_MS = 3000

const STATE_TEXT: Record<StepState, string> = {
    done: 'done',
    current: 'in progress',
    waiting: 'waiting for you',
    failed: 'failed',
    pending: '',
}

const AFTER_REMOVAL = new Set(['device_owner', 'restoring_apps', 'reconnecting', 'done'])

export function SetupProgress({ api, device, onSessionExpired }: Props) {
    const [setup, setSetup] = useState<DeviceSetup | null | undefined>(undefined)
    const [error, setError] = useState('')
    const [tick, setTick] = useState(0)
    const [clearing, setClearing] = useState(false)
    const [finishing, setFinishing] = useState(false)

    useEffect(() => {
        let current = true
        let timer: ReturnType<typeof setTimeout> | undefined
        api
            .getSetup(device.deviceId)
            .then((value) => {
                if (!current) return
                setSetup(value)
                setError('')
                if (value && isActive(value)) timer = setTimeout(() => setTick((count) => count + 1), REFRESH_MS)
            })
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else {
                    setError(errorText(caught))
                    timer = setTimeout(() => setTick((count) => count + 1), REFRESH_MS)
                }
            })
        return () => {
            current = false
            if (timer) clearTimeout(timer)
        }
    }, [api, device.deviceId, onSessionExpired, tick])

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
    const removing = setup.step === 'waiting_for_accounts' || setup.step === 'removing_app_accounts'

    return (
        <div class="stack">
            <div class="consent">
                <h3>This is your child's phone: {deviceName(device)}</h3>
                <p>Everything below is happening on that phone. Make sure it is your child's phone, not your own.</p>
            </div>
            <strong>Setup progress</strong>
            <ol class="guide">
                {stepStates(setup).map((step) => (
                    <li key={step.key} aria-current={step.state === 'current' || step.state === 'waiting' ? 'step' : undefined}>
                        {step.label}
                        {STATE_TEXT[step.state] && <span class="hint"> ({STATE_TEXT[step.state]})</span>}
                    </li>
                ))}
            </ol>
            {setup.message && <p role="status" class="notice">Phone says: {setup.message}</p>}
            <p class="hint">Last update from the phone {lastSeenText(setup.updatedAt)}.</p>
            <p role="alert" class="error">{error}</p>

            {waitingToPair(setup) && setup.pairingQr && (
                <PairPhone api={api} deviceId={device.deviceId} qr={setup.pairingQr} onSessionExpired={onSessionExpired} />
            )}

            {removing && setup.currentAccounts.length > 0 && (
                <div class="stack">
                    <strong>Still on the phone ({setup.currentAccounts.length})</strong>
                    {setup.status === 'waiting_for_parent' && (
                        <p class="untested">
                            On the phone, open Settings, then Accounts, and remove each account below. Before you do, write
                            down the password of each one: you need it to sign back in after setup.
                        </p>
                    )}
                    <ul class="reports">
                        {setup.currentAccounts.map((account) => (
                            <li key={`${account.type}\n${account.name}`}>
                                <strong>{accountTypeName(account.type)}</strong>
                                <span>{account.name}</span>
                            </li>
                        ))}
                    </ul>
                    <p class="hint">This list updates by itself as accounts are removed.</p>
                </div>
            )}

            {AFTER_REMOVAL.has(setup.step) && checklist.length > 0 && (
                <div class="stack">
                    <strong>Sign back in to the accounts you want</strong>
                    <p class="hint">
                        Manara now manages the phone. Sign back in only to the accounts you want to keep on it; you don't
                        need all of them.
                    </p>
                    <ul class="reports">
                        {checklist.map((account) => (
                            <li key={`${account.type}\n${account.name}`} class={account.back ? 'restored' : undefined}>
                                <strong>{account.back ? 'Back on the phone' : 'Not yet'}: {accountTypeName(account.type)}</strong>
                                <span>{account.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {setup.step === 'reconnecting' && setup.status === 'waiting_for_parent' && (
                <div class="stack">
                    <button type="button" class="primary" onClick={finish} disabled={finishing || !canFinish(setup)}>
                        {setup.finishRequested ? 'Finishing...' : finishing ? 'Sending...' : 'Finish setup'}
                    </button>
                    <p class="hint">Finish when the accounts you want are back. You can sign in to others later.</p>
                </div>
            )}

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
}
