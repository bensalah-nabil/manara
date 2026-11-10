import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { errorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { Rich } from './Rich.tsx'
import { t } from './i18n.ts'

type Stage =
    | { kind: 'idle' }
    | { kind: 'password' }
    | { kind: 'scan'; secret: string; uri: string }
    | { kind: 'codes'; codes: string[] }
    | { kind: 'turnOff' }

/**
 * Two-step sign-in with an authenticator app: turning it on (password, scan, first code, then the
 * recovery codes, shown once) and off (password and a current code).
 */
export function TwoStepPanel({ api, on, onChanged, onSessionExpired }: {
    api: Api
    on: boolean
    onChanged: () => void
    onSessionExpired: () => void
}) {
    const [stage, setStage] = useState<Stage>({ kind: 'idle' })
    const [password, setPassword] = useState('')
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function run(step: () => Promise<void>) {
        setBusy(true)
        setError('')
        try {
            await step()
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setBusy(false)
        }
    }

    const reset = () => { setStage({ kind: 'idle' }); setPassword(''); setCode(''); setError('') }

    return (
        <section class="card stack">
            <h3>{t('twoStep.title')}</h3>
            {stage.kind === 'idle' && (
                <>
                    <p>
                        {on
                            ? t('twoStep.on')
                            : t('twoStep.off')}
                    </p>
                    <button type="button" class={on ? 'ghost danger' : 'primary'} onClick={() => setStage({ kind: on ? 'turnOff' : 'password' })}>
                        {on ? t('twoStep.turnOff') : t('twoStep.turnOn')}
                    </button>
                </>
            )}

            {stage.kind === 'password' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => setStage({ kind: 'scan', ...(await api.setupTwoFactor(password)) })) }}>
                    <p class="muted">{t('twoStep.needApp')}</p>
                    <label>
                        {t('account.yourPassword')}
                        <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>{t('common.cancel')}</button>
                        <button type="submit" class="primary" disabled={busy}>{busy ? t('common.pleaseWait') : t('common.continue')}</button>
                    </div>
                </form>
            )}

            {stage.kind === 'scan' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { setStage({ kind: 'codes', codes: await api.enableTwoFactor(code) }); onChanged() }) }}>
                    <p>{t('twoStep.scan')}</p>
                    <QrCode value={stage.uri} label={t('twoStep.qrLabel')} />
                    <p class="muted small">{t('twoStep.cantScan')} <code class="token">{stage.secret}</code></p>
                    <label>
                        {t('twoStep.codeNow')}
                        <input autoComplete="one-time-code" inputMode="numeric" required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>{t('common.cancel')}</button>
                        <button type="submit" class="primary" disabled={busy}>{busy ? t('twoStep.checking') : t('twoStep.turnOnShort')}</button>
                    </div>
                </form>
            )}

            {stage.kind === 'codes' && (
                <div class="stack">
                    <p role="status" class="banner ok">{t('twoStep.isOn')}</p>
                    <p>
                        <Rich text={t('twoStep.saveCodes')} />
                    </p>
                    <ul class="recovery-codes">{stage.codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
                    <button type="button" class="primary" onClick={reset}>{t('twoStep.savedThem')}</button>
                </div>
            )}

            {stage.kind === 'turnOff' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.disableTwoFactor(password, code); reset(); onChanged() }) }}>
                    <p>{t('twoStep.offExplain')}</p>
                    <label>
                        {t('account.yourPassword')}
                        <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                    </label>
                    <label>
                        {t('twoStep.codeOrRecovery')}
                        <input autoComplete="one-time-code" required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>{t('common.cancel')}</button>
                        <button type="submit" class="danger" disabled={busy}>{busy ? t('common.pleaseWait') : t('twoStep.turnOffShort')}</button>
                    </div>
                </form>
            )}
            {error && <p role="alert" class="error">{error}</p>}
        </section>
    )
}
