import { useState } from 'react'
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
        <ol className="steps" aria-label="Setup steps">
            {(Object.keys(STEP_TITLES) as Step[]).map((step) => (
                <li key={step} aria-current={step === current ? 'step' : undefined}>{STEP_TITLES[step]}</li>
            ))}
        </ol>
    )
}

export function AddDevice({ api, onSessionExpired }: { api: Api; onSessionExpired: () => void }) {
    const [step, setStep] = useState<Step | null>(null)
    const [attestation, setAttestation] = useState<Attestation>(noAttestation)
    const [brand, setBrand] = useState('')
    const [prepared, setPrepared] = useState<Prepared>(nothingPrepared)
    const [token, setToken] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [copyNote, setCopyNote] = useState('')

    function reset() {
        setStep(null)
        setAttestation(noAttestation())
        setBrand('')
        setPrepared(nothingPrepared())
        setToken(null)
        setError('')
        setCopyNote('')
    }

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

    if (step === null) {
        return (
            <div className="card">
                <button type="button" onClick={() => setStep('consent')}>Add your child's phone</button>
            </div>
        )
    }

    const guide = guideFor(brand)

    return (
        <div className="card">
            <div className="row">
                <strong>Add your child's phone</strong>
                <button type="button" className="link" onClick={reset}>Cancel</button>
            </div>
            <Steps current={step} />

            {step === 'consent' && (
                <>
                    <div className="consent" role="group" aria-labelledby="consent-title">
                        <h3 id="consent-title">Only for your own child's phone</h3>
                        <p>
                            Manara gives you control over the phone you connect. Use it only on a phone used by your own child,
                            and never to watch another adult (a partner, an employee, a relative) without their knowledge. That is
                            illegal in many countries and is not allowed here.
                        </p>
                        {STATEMENTS.map(({ key, text }) => (
                            <label key={key} className="check">
                                <input
                                    type="checkbox"
                                    checked={attestation[key]}
                                    onChange={(event) => setAttestation({ ...attestation, [key]: event.target.checked })}
                                />
                                {text}
                            </label>
                        ))}
                        <p className="hint">Your confirmation is recorded with the date, together with this phone's setup.</p>
                    </div>
                    <button type="button" disabled={!attestationComplete(attestation)} onClick={() => setStep('brand')}>
                        Continue
                    </button>
                </>
            )}

            {step === 'brand' && (
                <>
                    <label>
                        Which brand is your child's phone?
                        <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                            <option value="">Choose a brand</option>
                            {PHONE_GUIDES.map((g) => (
                                <option key={g.brand} value={g.brand}>{g.name}</option>
                            ))}
                        </select>
                    </label>
                    {guide && (
                        <div className="stack">
                            <strong>Turn on USB debugging on the {guide.name} phone</strong>
                            {!guide.tested && (
                                <p className="hint untested">
                                    Manara has not been tested on this brand yet. These steps are the usual ones, but menu names can
                                    differ, and setup may not finish on this phone.
                                </p>
                            )}
                            <ol className="guide">
                                {guide.developerOptions.map((line) => <li key={line}>{line}</li>)}
                            </ol>
                            {guide.notes.map((note) => <p key={note} className="hint">{note}</p>)}
                        </div>
                    )}
                    <div className="row">
                        <button type="button" className="link" onClick={() => setStep('consent')}>Back</button>
                        <button type="button" disabled={!guide} onClick={() => setStep('prepare')}>Continue</button>
                    </div>
                </>
            )}

            {step === 'prepare' && (
                <>
                    <p>Before connecting, make sure of each of these. Setup removes every account from the phone for a few minutes.</p>
                    {PREPARE_ITEMS.map(({ key, text }) => (
                        <label key={key} className="check">
                            <input
                                type="checkbox"
                                checked={prepared[key]}
                                onChange={(event) => setPrepared({ ...prepared, [key]: event.target.checked })}
                            />
                            {text}
                        </label>
                    ))}
                    <p role="alert" className="error">{error}</p>
                    <div className="row">
                        <button type="button" className="link" onClick={() => setStep('brand')}>Back</button>
                        <button type="button" disabled={!preparedComplete(prepared) || busy} onClick={createCode}>
                            {busy ? 'Please wait...' : 'Continue'}
                        </button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && (
                <>
                    <strong>Connection code for this phone</strong>
                    <QrCode value={token} label="Connection code as a QR code" />
                    <code className="token">{token}</code>
                    <p className="hint">
                        The code works once and is shown only now. Guided connection from this page, with each step shown live, is
                        coming next. Until then, Manara support finishes the connection with you using this code.
                    </p>
                    <div className="row">
                        <button type="button" onClick={copy}>Copy</button>
                        <button type="button" className="link" onClick={reset}>Done</button>
                    </div>
                    <p role="status" className="hint">{copyNote}</p>
                </>
            )}
        </div>
    )
}
