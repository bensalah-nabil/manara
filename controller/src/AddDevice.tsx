import { useState } from 'preact/hooks'
import { ApiError, isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { ATTESTATION_VERSION, STATEMENTS, attestationComplete, noAttestation } from './enrollment.ts'
import type { Attestation } from './enrollment.ts'
import { authErrorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { MANARA_APK_URL, QR_SETUP_STEPS, provisioningQr, qrSetupAvailable } from './provisioning.ts'
import { t } from './i18n.ts'

type Step = 'consent' | 'how' | 'install' | 'code'

/**
 * How the phone joins: the phone the child already uses (guided setup, nothing reset), a new or
 * reset phone (one QR code), or a phone that already has Manara (moving accounts).
 */
type Way = 'inUse' | 'fresh' | 'move'

/** The public page the child's phone downloads Manara from (`public/download.html`). */
const DOWNLOAD_PATH = '/download.html'

/**
 * Only the phone in use has to install Manara first: QR setup installs it by itself, and a phone
 * being moved already has it.
 */
function stepsFor(way: Way | null): [Step, string][] {
    return way === 'inUse'
        ? [['consent', t('add.step1')], ['how', t('add.stepHow')], ['install', t('add.stepInstall')], ['code', t('add.stepConnectAfterInstall')]]
        : [['consent', t('add.step1')], ['how', t('add.stepHow')], ['code', t('add.stepConnect')]]
}

function Steps({ current, way }: { current: Step; way: Way | null }) {
    return (
        <ol class="steps" aria-label={t('add.stepsLabel')}>
            {stepsFor(way).map(([step, title]) => (
                <li key={step} aria-current={step === current ? 'step' : undefined}>{title}</li>
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
    // No default: the two paths differ too much (erase the phone, or remove its accounts for a
    // moment) for the console to pick one for the parent.
    const [way, setWay] = useState<Way | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [copyNote, setCopyNote] = useState('')
    // A phone is only added to an account with two-step sign-in (the server refuses otherwise).
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
    const downloadUrl = `${window.location.origin}${DOWNLOAD_PATH}`
    // What a parent types on the phone when the camera can't scan: no "https://".
    const downloadText = `${window.location.host}${DOWNLOAD_PATH}`

    return (
        <div class="wizard">
            <div class="device-head">
                <h1>{t('add.title')}</h1>
                <button type="button" class="ghost" onClick={onDone}>{t('common.cancel')}</button>
            </div>
            <Steps current={step} way={way} />
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
                        {qrOffered && (
                            <label class="check choice">
                                <input type="radio" name="way" checked={way === 'fresh'} onChange={() => setWay('fresh')} />
                                <span>
                                    <strong>{t('add.pathQr')}</strong> <span class="tag ok">{t('add.pathFreshTag')}</span>
                                    <span class="muted small"> {t('add.pathQrHelp')}</span>
                                </span>
                            </label>
                        )}
                        <label class="check choice">
                            <input type="radio" name="way" checked={way === 'inUse'} onChange={() => setWay('inUse')} />
                            <span>
                                <strong>{t('add.howInUse')}</strong> <span class="tag">{t('add.pathInUseTag')}</span>
                                <span class="muted small"> {t('add.howInUseHelp')}</span>
                            </span>
                        </label>
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
                    {way === 'inUse' && (
                        <div class="notice stack" role="group" aria-labelledby="ready-title">
                            <strong id="ready-title">{t('add.inUseNeedTitle')}</strong>
                            <ul class="guide">
                                <li>{t('add.inUseNeed.google')}</li>
                                <li>{t('add.inUseNeed.samsung')}</li>
                                <li>{t('add.inUseNeed.xiaomi')}</li>
                                <li>{t('add.inUseNeed.power')}</li>
                                <li>{t('add.inUseNeed.time')}</li>
                            </ul>
                        </div>
                    )}
                    <p role="alert" class="error">{error}</p>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('consent')}>{t('common.back')}</button>
                        <button type="button" class="primary" disabled={busy || way === null} onClick={way === 'inUse' ? () => setStep('install') : createCode}>
                            {busy ? t('common.pleaseWait') : t('common.continue')}
                        </button>
                    </div>
                </>
            )}

            {step === 'install' && (
                <>
                    <strong>{t('add.installTitle')}</strong>
                    <p>{t('add.installText')}</p>
                    <QrCode value={downloadUrl} label={t('add.installQrLabel')} />
                    <code class="token">{downloadText}</code>
                    <p class="hint">{t('add.installHint')}</p>
                    <p role="alert" class="error">{error}</p>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('how')}>{t('common.back')}</button>
                        <button type="button" class="primary" disabled={busy} onClick={createCode}>
                            {busy ? t('common.pleaseWait') : t('add.installDone')}
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
