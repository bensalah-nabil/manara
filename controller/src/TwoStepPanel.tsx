import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { errorText } from './format.ts'
import { QrCode } from './QrCode.tsx'

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
            <h3>Two-step sign-in</h3>
            {stage.kind === 'idle' && (
                <>
                    <p>
                        {on
                            ? 'On. Signing in asks for a code from your authenticator app as well as your password.'
                            : 'Off. Turn it on so that a stolen password alone cannot open this console, which controls your child\'s phone.'}
                    </p>
                    <button type="button" class={on ? 'ghost danger' : 'primary'} onClick={() => setStage({ kind: on ? 'turnOff' : 'password' })}>
                        {on ? 'Turn off two-step sign-in' : 'Turn on two-step sign-in'}
                    </button>
                </>
            )}

            {stage.kind === 'password' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => setStage({ kind: 'scan', ...(await api.setupTwoFactor(password)) })) }}>
                    <p class="muted">You need an authenticator app on your own phone, such as Google Authenticator or Microsoft Authenticator.</p>
                    <label>
                        Your password
                        <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>Cancel</button>
                        <button type="submit" class="primary" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}</button>
                    </div>
                </form>
            )}

            {stage.kind === 'scan' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { setStage({ kind: 'codes', codes: await api.enableTwoFactor(code) }); onChanged() }) }}>
                    <p>In your authenticator app, add an account and scan this code.</p>
                    <QrCode value={stage.uri} label="Two-step sign-in code for the authenticator app" />
                    <p class="muted small">Can't scan? Enter this key in the app instead: <code class="token">{stage.secret}</code></p>
                    <label>
                        The 6-digit code the app shows now
                        <input autoComplete="one-time-code" inputMode="numeric" required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>Cancel</button>
                        <button type="submit" class="primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</button>
                    </div>
                </form>
            )}

            {stage.kind === 'codes' && (
                <div class="stack">
                    <p role="status" class="banner ok">Two-step sign-in is on.</p>
                    <p>
                        <strong>Save these recovery codes now.</strong> Each one signs you in once if you lose the phone with
                        the app. They are shown only this once: write them down or store them in a password manager.
                    </p>
                    <ul class="recovery-codes">{stage.codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
                    <button type="button" class="primary" onClick={reset}>I saved them</button>
                </div>
            )}

            {stage.kind === 'turnOff' && (
                <form class="stack" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.disableTwoFactor(password, code); reset(); onChanged() }) }}>
                    <p>Signing in will need only your password again. Your recovery codes stop working.</p>
                    <label>
                        Your password
                        <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                    </label>
                    <label>
                        A code from the app, or a recovery code
                        <input autoComplete="one-time-code" required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
                    </label>
                    <div class="actions">
                        <button type="button" class="ghost" onClick={reset}>Cancel</button>
                        <button type="submit" class="danger" disabled={busy}>{busy ? 'Please wait…' : 'Turn off'}</button>
                    </div>
                </form>
            )}
            {error && <p role="alert" class="error">{error}</p>}
        </section>
    )
}
