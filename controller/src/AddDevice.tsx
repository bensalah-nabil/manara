import { useState } from 'preact/hooks'
import { ApiError, isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { ATTESTATION_VERSION, STATEMENTS, attestationComplete, noAttestation } from './enrollment.ts'
import type { Attestation } from './enrollment.ts'
import { authErrorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { MANARA_APK_URL, QR_SETUP_STEPS, provisioningQr, qrSetupAvailable } from './provisioning.ts'
import { t } from './i18n.ts'

type Step = 'consent' | 'how' | 'code'

/**
 * How the phone joins: the phone the child already uses (guided setup, nothing reset), a new or
 * reset phone (one QR code), or a phone that already has Manara (moving accounts).
 */
type Way = 'inUse' | 'fresh' | 'move'

const STEP_TITLES: Record<Step, string> = {
    consent: t('add.step1'),
    how: t('add.stepHow'),
    code: t('add.stepConnect'),
}

function Steps({ current }: { current: Step }) {
    return (
        <ol class="steps" aria-label={t('add.stepsLabel')}>
            {(Object.keys(STEP_TITLES) as Step[]).map((step) => (
                <li key={step} aria-current={step === current ? 'step' : undefined}>{STEP_TITLES[step]}</li>
            ))}
        </ol>
    )
}

/**
 * Adding a phone asks only what the parent alone knows: the three statements and how the phone
 * joins. Everything that depends on the phone itself (its maker, its Android version, whether
 * Developer options are on) is read from the phone once it has scanned the code, and its page then
 * shows only the steps for that phone ([PhoneReady]).
 */
export function AddDevice({ api, onSessionExpired, onDone }: { api: Api; onSessionExpired: () => void; onDone: () => void }) {
    const [step, setStep] = useState<Step>('consent')
    const [attestation, setAttestation] = useState<Attestation>(noAttestation)
    const qrOffered = qrSetupAvailable(MANARA_APK_URL)
    const [way, setWay] = useState<Way>('inUse')
    const [token, setToken] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [copyNote, setCopyNote] = useState('')

    async function createCode() {
        setBusy(true)
        setError('')
        try {
            // No brand: the phone reports its maker when it connects.
            setToken(await api.createEnrollmentToken({ attestation, version: ATTESTATION_VERSION, phoneBrand: '' }))
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
            setCopyNote(t('add.copied'))
        } catch {
            setCopyNote(t('add.copyFailed'))
        }
    }

    const byQr = way === 'fresh' && qrOffered

    return (
        <div class="wizard">
            <div class="device-head">
                <h1>{t('add.title')}</h1>
                <button type="button" class="ghost" onClick={onDone}>{t('common.cancel')}</button>
            </div>
            <Steps current={step} />
            <div class="card stack">

            {step === 'consent' && (
                <>
                    <div class="consent" role="group" aria-labelledby="consent-title">
                        <h3 id="consent-title">{t('add.consentTitle')}</h3>
                        <p>{t('add.consentText')}</p>
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
                        <p class="hint">{t('add.consentRecorded')}</p>
                    </div>
                    <button type="button" class="primary" disabled={!attestationComplete(attestation)} onClick={() => setStep('how')}>
                        {t('common.continue')}
                    </button>
                </>
            )}

            {step === 'how' && (
                <>
                    <fieldset class="group">
                        <legend>{t('add.howQuestion')}</legend>
                        <label class="check">
                            <input type="radio" name="way" checked={way === 'inUse'} onChange={() => setWay('inUse')} />
                            <span>
                                {t('add.howInUse')}
                                <span class="muted small"> {t('add.howInUseHelp')}</span>
                            </span>
                        </label>
                        {qrOffered && (
                            <label class="check">
                                <input type="radio" name="way" checked={way === 'fresh'} onChange={() => setWay('fresh')} />
                                <span>
                                    {t('add.pathQr')}
                                    <span class="muted small"> {t('add.pathQrHelp')}</span>
                                </span>
                            </label>
                        )}
                        <label class="check">
                            <input type="radio" name="way" checked={way === 'move'} onChange={() => setWay('move')} />
                            <span>
                                {t('add.alreadyYes')}
                                <span class="muted small"> {t('add.alreadyYesHelp')}</span>
                            </span>
                        </label>
                    </fieldset>
                    {byQr && (
                        <div class="consent stack" role="group" aria-labelledby="reset-title">
                            <h3 id="reset-title">{t('add.resetTitle')}</h3>
                            <p>{t('add.resetText')}</p>
                        </div>
                    )}
                    <p role="alert" class="error">{error}</p>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('consent')}>{t('common.back')}</button>
                        <button type="button" class="primary" disabled={busy} onClick={createCode}>
                            {busy ? t('common.pleaseWait') : t('common.continue')}
                        </button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && byQr && (
                <>
                    <strong>{t('add.qrTitle')}</strong>
                    <ol class="guide">
                        {QR_SETUP_STEPS.map((line) => <li key={line}>{line}</li>)}
                    </ol>
                    <QrCode value={provisioningQr(token, MANARA_APK_URL!)} label={t('add.qrLabel')} large />
                    <p class="hint">{t('add.qrHint')}</p>
                    <div class="actions">
                        <button type="button" class="primary" onClick={onDone}>{t('common.done')}</button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && !byQr && (
                <>
                    <strong>{t('add.codeTitle')}</strong>
                    <QrCode value={token} label={t('add.codeQrLabel')} />
                    <code class="token">{token}</code>
                    <p class="hint">{way === 'move' ? t('add.codeHintMove') : t('add.codeHintGuided')}</p>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={copy}>{t('add.copy')}</button>
                        <button type="button" class="primary" onClick={onDone}>{t('common.done')}</button>
                    </div>
                    <p role="status" class="hint">{copyNote}</p>
                </>
            )}
            </div>
        </div>
    )
}
