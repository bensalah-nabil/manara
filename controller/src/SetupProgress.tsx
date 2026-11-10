import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { agoText, deviceName, errorText, lastSeenText } from './format.ts'
import { PairPhone } from './PairPhone.tsx'
import { Rich } from './Rich.tsx'
import { accountTypeName, canFinish, isActive, phoneQuiet, reconnectChecklist, signBackInWays, stepStates, waitingToPair } from './setup.ts'
import type { DeviceSetup, SetupAccount, SetupStepKey, StepState } from './setup.ts'
import { t } from './i18n.ts'

/** While the phone works, the console looks every 2 s; after a failure, every 5 s, to notice a new run. */
const LIVE_MS = 2000
const FAILED_MS = 5000

const STATE_TEXT: Record<StepState, string> = {
    done: t('setup.state.done'),
    current: t('setup.state.current'),
    waiting: t('setup.state.waiting'),
    failed: t('setup.state.failed'),
    pending: '',
}

function secondsAgo(iso: string, now: number): string {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
    if (Number.isNaN(seconds)) return ''
    if (seconds < 5) return t('time.justNow')
    if (seconds < 60) return t('time.sAgo', { n: seconds })
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? t('time.minAgo', { n: minutes }) : lastSeenText(iso)
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

/** For each kind of account to remove, the ways back in that need no remembered password, then a confirmation. */
function ReadyCheck({ accounts, ready, onReady }: { accounts: SetupAccount[]; ready: boolean; onReady: (ready: boolean) => void }) {
    // Google first: once it is back, its saved passwords bring the other apps' back with them.
    const types = [...new Set(accounts.map((account) => account.type))].sort((a, b) => Number(b === 'com.google') - Number(a === 'com.google'))
    return (
        <div class="stack">
            {types.map((type) => (
                <div key={type}>
                    <strong>{accountTypeName(type)}</strong>
                    <ul>
                        {signBackInWays(type).map((way) => (
                            <li key={way.text}>
                                {way.text}{' '}
                                {way.link && <a href={way.link.href} target="_blank" rel="noopener noreferrer">{way.link.label}</a>}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            <label>
                <input type="checkbox" checked={ready} onChange={(event) => onReady((event.target as HTMLInputElement).checked)} />{' '}
                I can get back in to these accounts
            </label>
        </div>
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
    // The parent confirms they can get back in before being told to remove anything.
    const [ready, setReady] = useState(false)

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

    const active = !!setup && isActive(setup)
    useEffect(() => {
        if (!active) return
        const clock = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(clock)
    }, [active])

    async function clearAccounts() {
        if (!window.confirm(t('setup.confirmClear'))) return
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
    // A phone turned off or restarted mid-setup stops sending: don't call that live.
    const quiet = phoneQuiet(setup, now)
    const live = active && !quiet
    const message = setup.message && <p role="status" class="notice">{t('setup.phoneSays', { message: setup.message })}</p>

    const shown = setup
    /** What the step the phone is on needs, shown right under it. */
    function detail(key: SetupStepKey, state: StepState): ComponentChildren {
        if (state === 'failed') {
            return (
                <>
                    {message}
                    <p>
                        {t('setup.stopped')}
                    </p>
                    {checklist.length > 0 && <><strong>{t('setup.whatWasOn')}</strong><Accounts accounts={checklist} /></>}
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
                                <strong>{t('setup.beforeRemoving')}</strong>
                                <ReadyCheck accounts={shown.currentAccounts} ready={ready} onReady={setReady} />
                                {ready && (
                                    <p>
                                        <Rich text={t('setup.removeHelp')} />
                                    </p>
                                )}
                                <strong>{t('setup.stillOn', { n: shown.currentAccounts.length })}</strong>
                                <Accounts accounts={shown.currentAccounts} />
                                <p class="hint">{t('setup.listUpdates')}</p>
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
                            <p>{t('setup.nowManages')}</p>
                        )}
                        {quiet && (
                            <p class="hint">
                                {t('setup.quietHint', { when: lastSeenText(shown.updatedAt) })}
                            </p>
                        )}
                        <ul class="reports">
                            {checklist.map((account) => (
                                <li key={`${account.type}\n${account.name}`} class={account.back ? 'restored' : undefined}>
                                    <strong>{t('setup.accountLine', { state: account.back ? t('setup.back') : t('setup.notYet'), type: accountTypeName(account.type) })}</strong>
                                    <span>{account.name}</span>
                                </li>
                            ))}
                        </ul>
                        {state === 'waiting' && (
                            <>
                                <button type="button" class="primary" onClick={finish} disabled={finishing || !canFinish(shown)}>
                                    {finishing ? t('setup.finishing') : t('setup.finish')}
                                </button>
                                <p class="hint">
                                    {t('setup.finishHint')}
                                </p>
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
                    <h3>{t('setup.childPhoneTitle', { name: deviceName(device) })}</h3>
                    <p>{t('setup.childPhoneText')}</p>
                </div>
            )}
            <div class="timeline-head">
                <strong>{t('setup.heading')}</strong>
                {live ? (
                    <span class="live"><span class="live-dot" aria-hidden="true" />{t('setup.live', { when: secondsAgo(setup.updatedAt, now) })}</span>
                ) : (
                    <span class="hint">{t(quiet ? 'setup.noUpdateSince' : 'setup.lastUpdate', { when: lastSeenText(setup.updatedAt) })}</span>
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
                    <summary>{t('setup.accountsWere', { n: checklist.length })}</summary>
                    <ul class="reports">
                        {checklist.map((account) => (
                            <li key={`${account.type}\n${account.name}`} class={account.back ? 'restored' : undefined}>
                                <strong>{t('setup.accountLine', { state: account.back ? t('setup.back') : t('setup.notSignedBack'), type: accountTypeName(account.type) })}</strong>
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
                        {t('setup.keepHint')}
                    </p>
                    <button type="button" onClick={clearAccounts} disabled={clearing}>
                        {clearing ? t('setup.deleting') : t('setup.deleteList')}
                    </button>
                </div>
            )}
        </div>
    )
    // Once the phone is set up, the timeline is history: one closed line, opened only on demand.
    if (!done) return body
    return (
        <details class="setup-done">
            <summary title={lastSeenText(setup.updatedAt)}>{t('setup.finished', { when: agoText(setup.updatedAt) })}</summary>
            {body}
        </details>
    )
}
