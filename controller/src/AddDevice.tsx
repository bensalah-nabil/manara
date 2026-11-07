import { useState } from 'preact/hooks'
import { ApiError, isSessionError } from './api.ts'
import type { Api } from './api.ts'
import {
    ATTESTATION_VERSION,
    PHONE_GUIDES,
    PREPARE_ITEMS,
    STATEMENTS,
    attestationComplete,
    guideFor,
    noAttestation,
    nothingPrepared,
    preparedComplete,
} from './enrollment.ts'
import type { Attestation, Prepared } from './enrollment.ts'
import { authErrorText } from './format.ts'
import { QrCode } from './QrCode.tsx'

type Step = 'consent' | 'brand' | 'prepare' | 'code'

const STEP_TITLES: Record<Step, string> = {
    consent: '1. Confirm',
    brand: '2. Phone type',
    prepare: '3. Prepare',
    code: '4. Connect',
}

function Steps({ current }: { current: Step }) {
    return (
        <ol class="steps" aria-label="Setup steps">
            {(Object.keys(STEP_TITLES) as Step[]).map((step) => (
                <li key={step} aria-current={step === current ? 'step' : undefined}>{STEP_TITLES[step]}</li>
            ))}
        </ol>
    )
}

export function AddDevice({ api, onSessionExpired, onDone }: { api: Api; onSessionExpired: () => void; onDone: () => void }) {
    const [step, setStep] = useState<Step>('consent')
    const [attestation, setAttestation] = useState<Attestation>(noAttestation)
    const [brand, setBrand] = useState('')
    // A phone already managed by Manara (moving it from another account) skips the setup guide and checklist.
    const [alreadySetUp, setAlreadySetUp] = useState<boolean | null>(null)
    const [prepared, setPrepared] = useState<Prepared>(nothingPrepared)
    const [token, setToken] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [copyNote, setCopyNote] = useState('')

    const reset = onDone

    async function createCode() {
        setBusy(true)
        setError('')
        try {
            setToken(await api.createEnrollmentToken({ attestation, version: ATTESTATION_VERSION, phoneBrand: brand }))
            setStep('code')
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
        } finally {
            setBusy(false)
        }
    }

    async function copy() {
        if (token === null) return
        try {
            await navigator.clipboard.writeText(token)
            setCopyNote('Copied.')
        } catch {
            setCopyNote('Could not copy automatically. Select the code and copy it.')
        }
    }

    const guide = guideFor(brand)

    return (
        <div class="wizard">
            <div class="device-head">
                <h1>Add your child's phone</h1>
                <button type="button" class="ghost" onClick={reset}>Cancel</button>
            </div>
            <Steps current={step} />
            <div class="card stack">

            {step === 'consent' && (
                <>
                    <div class="consent" role="group" aria-labelledby="consent-title">
                        <h3 id="consent-title">Only for your own child's phone</h3>
                        <p>
                            Manara gives you control over the phone you connect. Use it only on a phone used by your own child,
                            and never to watch another adult (a partner, an employee, a relative) without their knowledge. That is
                            illegal in many countries and is not allowed here.
                        </p>
                        {STATEMENTS.map(({ key, text }) => (
                            <label key={key} class="check">
                                <input
                                    type="checkbox"
                                    checked={attestation[key]}
                                    onChange={(event) => {
                                        const on = event.currentTarget.checked
                                        setAttestation((current) => ({ ...current, [key]: on }))
                                    }}
                                />
                                {text}
                            </label>
                        ))}
                        <p class="hint">Your confirmation is recorded with the date, together with this phone's setup.</p>
                    </div>
                    <button type="button" class="primary" disabled={!attestationComplete(attestation)} onClick={() => setStep('brand')}>
                        Continue
                    </button>
                </>
            )}

            {step === 'brand' && (
                <>
                    <label>
                        Which brand is your child's phone?
                        <select value={brand} onChange={(event) => setBrand(event.currentTarget.value)}>
                            <option value="">Choose a brand</option>
                            {PHONE_GUIDES.map((g) => (
                                <option key={g.brand} value={g.brand}>{g.name}</option>
                            ))}
                        </select>
                    </label>
                    {guide && (
                        <fieldset class="group">
                            <legend>Is Manara already set up on this phone?</legend>
                            <label class="check">
                                <input type="radio" name="already" checked={alreadySetUp === false} onChange={() => setAlreadySetUp(false)} />
                                <span>No, set it up now</span>
                            </label>
                            <label class="check">
                                <input type="radio" name="already" checked={alreadySetUp === true} onChange={() => setAlreadySetUp(true)} />
                                <span>
                                    Yes, it already shows Manara's "managed" notice
                                    <span class="muted small"> Moving it from another account. Its setup stays; it just joins this account.</span>
                                </span>
                            </label>
                        </fieldset>
                    )}
                    {guide && alreadySetUp === false && (
                        <div class="stack">
                            <strong>Turn on wireless debugging on the {guide.name} phone</strong>
                            {!guide.tested && (
                                <p class="hint untested">
                                    Manara has not been tested on this brand yet. These steps are the usual ones, but menu names can
                                    differ, and setup may not finish on this phone.
                                </p>
                            )}
                            <ol class="guide">
                                {guide.developerOptions.map((line) => <li key={line}>{line}</li>)}
                            </ol>
                            {guide.notes.map((note) => <p key={note} class="hint">{note}</p>)}
                        </div>
                    )}
                    {alreadySetUp && <p role="alert" class="error">{error}</p>}
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('consent')}>Back</button>
                        <button
                            type="button"
                            class="primary"
                            disabled={!guide || alreadySetUp === null || busy}
                            onClick={alreadySetUp ? createCode : () => setStep('prepare')}
                        >
                            {busy ? 'Please wait…' : 'Continue'}
                        </button>
                    </div>
                </>
            )}

            {step === 'prepare' && (
                <>
                    <p>Before connecting, make sure of each of these. Setup removes every account from the phone for a few minutes.</p>
                    {PREPARE_ITEMS.map(({ key, text }) => (
                        <label key={key} class="check">
                            <input
                                type="checkbox"
                                checked={prepared[key]}
                                onChange={(event) => {
                                const on = event.currentTarget.checked
                                setPrepared((current) => ({ ...current, [key]: on }))
                            }}
                            />
                            {text}
                        </label>
                    ))}
                    <p role="alert" class="error">{error}</p>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('brand')}>Back</button>
                        <button type="button" class="primary" disabled={!preparedComplete(prepared) || busy} onClick={createCode}>
                            {busy ? 'Please wait…' : 'Continue'}
                        </button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && (
                <>
                    <strong>Connection code for this phone</strong>
                    <QrCode value={token} label="Connection code as a QR code" />
                    <code class="token">{token}</code>
                    {alreadySetUp ? (
                        <p class="hint">
                            The code works once and is shown only now. On the phone, open Manara and tap "Scan the code" (or type
                            it). The phone keeps its setup, takes this account's rules, and deletes anything it had not yet sent to
                            the previous account. It then appears in your list of phones.
                        </p>
                    ) : (
                        <p class="hint">
                            The code works once and is shown only now. On the phone, open Manara, tap "Scan the code" and scan it.
                            Then tap "Start guided setup" in Manara, open Wireless debugging, and leave the phone on that screen. This
                            phone's page here shows a pairing QR code to scan with the phone, or a box for the phone's pairing code,
                            then each step: which accounts to remove and, at the end, which to sign back in to.
                        </p>
                    )}
                    <div class="actions">
                        <button type="button" class="ghost" onClick={copy}>Copy code</button>
                        <button type="button" class="primary" onClick={reset}>Done</button>
                    </div>
                    <p role="status" class="hint">{copyNote}</p>
                </>
            )}
            </div>
        </div>
    )
}
