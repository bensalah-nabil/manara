import { useState } from 'preact/hooks'
import { ApiError, isSessionError } from './api.ts'
import type { Api } from './api.ts'
import {
    ATTESTATION_VERSION,
    NO_ACCOUNTS_YET,
    PHONE_GUIDES,
    PREPARE_ITEMS,
    STATEMENTS,
    accountsText,
    attestationComplete,
    guideFor,
    needsGoogleCheck,
    noAttestation,
    nothingPrepared,
    preparedComplete,
} from './enrollment.ts'
import type { Attestation, Prepared } from './enrollment.ts'
import { authErrorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { MANARA_APK_URL, QR_SETUP_STEPS, provisioningQr, qrSetupAvailable } from './provisioning.ts'
import { signBackInWays } from './setup.ts'
import { t } from './i18n.ts'

type Step = 'consent' | 'brand' | 'prepare' | 'code'

const STEP_TITLES: Record<Step, string> = {
    consent: t('add.step1'),
    brand: t('add.step2'),
    prepare: t('add.step3'),
    code: t('add.step4'),
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

export function AddDevice({ api, onSessionExpired, onDone }: { api: Api; onSessionExpired: () => void; onDone: () => void }) {
    const [step, setStep] = useState<Step>('consent')
    const [attestation, setAttestation] = useState<Attestation>(noAttestation)
    const [brand, setBrand] = useState('')
    // A phone already managed by Manara (moving it from another account) skips the setup guide and checklist.
    const [alreadySetUp, setAlreadySetUp] = useState<boolean | null>(null)
    const [prepared, setPrepared] = useState<Prepared>(nothingPrepared)
    // Asked before any setting is changed: on Samsung the Google account is removed for a moment.
    const [googleReady, setGoogleReady] = useState(false)
    // A new phone, or one the parent resets: one QR code, nothing to turn on or remove.
    const [path, setPath] = useState<'guided' | 'qr'>('guided')
    const qrOffered = qrSetupAvailable(MANARA_APK_URL)
    const byQr = qrOffered && path === 'qr'
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
            setCopyNote(t('add.copied'))
        } catch {
            setCopyNote(t('add.copyFailed'))
        }
    }

    const guide = guideFor(brand)
    const accountsClear = !!guide && (!needsGoogleCheck(guide) || googleReady)

    return (
        <div class="wizard">
            <div class="device-head">
                <h1>{t('add.title')}</h1>
                <button type="button" class="ghost" onClick={reset}>{t('common.cancel')}</button>
            </div>
            <Steps current={step} />
            <div class="card stack">

            {step === 'consent' && (
                <>
                    <div class="consent" role="group" aria-labelledby="consent-title">
                        <h3 id="consent-title">{t('add.consentTitle')}</h3>
                        <p>
                            {t('add.consentText')}
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
                        <p class="hint">{t('add.consentRecorded')}</p>
                    </div>
                    <button type="button" class="primary" disabled={!attestationComplete(attestation)} onClick={() => setStep('brand')}>
                        {t('common.continue')}
                    </button>
                </>
            )}

            {step === 'brand' && (
                <>
                    <label>
                        {t('add.brandQuestion')}
                        <select value={brand} onChange={(event) => setBrand(event.currentTarget.value)}>
                            <option value="">{t('add.chooseBrand')}</option>
                            {PHONE_GUIDES.map((g) => (
                                <option key={g.brand} value={g.brand}>{g.name}</option>
                            ))}
                        </select>
                    </label>
                    {guide && (
                        <fieldset class="group">
                            <legend>{t('add.alreadyQuestion')}</legend>
                            <label class="check">
                                <input type="radio" name="already" checked={alreadySetUp === false} onChange={() => setAlreadySetUp(false)} />
                                <span>{t('add.alreadyNo')}</span>
                            </label>
                            <label class="check">
                                <input type="radio" name="already" checked={alreadySetUp === true} onChange={() => setAlreadySetUp(true)} />
                                <span>
                                    {t('add.alreadyYes')}
                                    <span class="muted small"> {t('add.alreadyYesHelp')}</span>
                                </span>
                            </label>
                        </fieldset>
                    )}
                    {guide && alreadySetUp === false && qrOffered && (
                        <fieldset class="group">
                            <legend>{t('add.howQuestion')}</legend>
                            <label class="check">
                                <input type="radio" name="path" checked={path === 'guided'} onChange={() => setPath('guided')} />
                                <span>
                                    {t('add.pathGuided')}
                                    <span class="muted small"> {t('add.pathGuidedHelp')}</span>
                                </span>
                            </label>
                            <label class="check">
                                <input type="radio" name="path" checked={path === 'qr'} onChange={() => setPath('qr')} />
                                <span>
                                    {t('add.pathQr')}
                                    <span class="muted small"> {t('add.pathQrHelp')}</span>
                                </span>
                            </label>
                        </fieldset>
                    )}
                    {guide && alreadySetUp === false && byQr && (
                        <div class="consent stack" role="group" aria-labelledby="reset-title">
                            <h3 id="reset-title">{t('add.resetTitle')}</h3>
                            <p>
                                Photos, chats, apps and accounts on it are deleted. If any of it matters, back it up first, or choose
                                t('add.pathGuided') instead. A brand new phone has nothing to lose.
                            </p>
                        </div>
                    )}
                    {guide && alreadySetUp === false && !byQr && (
                        <div class="consent stack" role="group" aria-labelledby="accounts-title">
                            <h3 id="accounts-title">{t('add.accountsTitle')}</h3>
                            <p>{accountsText(guide)}</p>
                            {needsGoogleCheck(guide) && (
                                <>
                                    <strong>{t('add.googleWays')}</strong>
                                    <ul>
                                        {signBackInWays('com.google').map((way) => (
                                            <li key={way.text}>
                                                {way.text}{' '}
                                                {way.link && <a href={way.link.href} target="_blank" rel="noopener noreferrer">{way.link.label}</a>}
                                            </li>
                                        ))}
                                    </ul>
                                    <label class="check">
                                        <input type="checkbox" checked={googleReady} onChange={(event) => setGoogleReady(event.currentTarget.checked)} />
                                        {t('add.googleReady')}
                                    </label>
                                </>
                            )}
                            <p class="hint">{NO_ACCOUNTS_YET}</p>
                        </div>
                    )}
                    {guide && alreadySetUp === false && !byQr && accountsClear && (
                        <div class="stack">
                            <strong>{t('add.debugTitle', { brand: guide.name })}</strong>
                            {!guide.tested && (
                                <p class="hint untested">
                                    {t('add.untested')}
                                </p>
                            )}
                            <ol class="guide">
                                {guide.developerOptions.map((line) => <li key={line}>{line}</li>)}
                            </ol>
                            {guide.notes.map((note) => <p key={note} class="hint">{note}</p>)}
                            {guide.pictures && (
                                <div class="guide-pictures">
                                    {guide.pictures.map((picture) => (
                                        <figure key={picture.src}>
                                            <img src={picture.src} alt={picture.alt} loading="lazy" width={540} />
                                            <figcaption>{picture.caption}</figcaption>
                                        </figure>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {alreadySetUp && <p role="alert" class="error">{error}</p>}
                    <div class="actions">
                        <button type="button" class="ghost" onClick={() => setStep('consent')}>{t('common.back')}</button>
                        <button
                            type="button"
                            class="primary"
                            disabled={!guide || alreadySetUp === null || (alreadySetUp === false && !byQr && !accountsClear) || busy}
                            onClick={alreadySetUp || byQr ? createCode : () => setStep('prepare')}
                        >
                            {busy ? t('common.pleaseWait') : t('common.continue')}
                        </button>
                    </div>
                </>
            )}

            {step === 'prepare' && (
                <>
                    <p>{t('add.prepareIntro')}</p>
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
                        <button type="button" class="ghost" onClick={() => setStep('brand')}>{t('common.back')}</button>
                        <button type="button" class="primary" disabled={!preparedComplete(prepared) || busy} onClick={createCode}>
                            {busy ? t('common.pleaseWait') : t('common.continue')}
                        </button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && byQr && !alreadySetUp && (
                <>
                    <strong>{t('add.qrTitle')}</strong>
                    <ol class="guide">
                        {QR_SETUP_STEPS.map((line) => <li key={line}>{line}</li>)}
                    </ol>
                    <QrCode value={provisioningQr(token, MANARA_APK_URL!)} label={t('add.qrLabel')} large />
                    <p class="hint">
                        {t('add.qrHint')}
                    </p>
                    <div class="actions">
                        <button type="button" class="primary" onClick={reset}>{t('common.done')}</button>
                    </div>
                </>
            )}

            {step === 'code' && token !== null && !(byQr && !alreadySetUp) && (
                <>
                    <strong>{t('add.codeTitle')}</strong>
                    <QrCode value={token} label={t('add.codeQrLabel')} />
                    <code class="token">{token}</code>
                    {alreadySetUp ? (
                        <p class="hint">
                            {t('add.codeHintMove')}
                        </p>
                    ) : (
                        <p class="hint">
                            {t('add.codeHintNew')}
                        </p>
                    )}
                    <div class="actions">
                        <button type="button" class="ghost" onClick={copy}>{t('add.copy')}</button>
                        <button type="button" class="primary" onClick={reset}>{t('common.done')}</button>
                    </div>
                    <p role="status" class="hint">{copyNote}</p>
                </>
            )}
            </div>
        </div>
    )
}
