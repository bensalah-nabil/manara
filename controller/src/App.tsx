import { colorHex, initial } from './profile.ts'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { ApiError, createApi, isSessionError, needsSecondStep } from './api.ts'
import type { Api, DeviceSummary } from './api.ts'
import { AccountPanel } from './AccountPanel.tsx'
import { resetToken } from './account.ts'
import { AddDevice } from './AddDevice.tsx'
import { DevicePanel } from './DevicePanel.tsx'
import { agoText, authErrorText, deviceName, lastSeenText, statusText } from './format.ts'
import { createSessionStore } from './session.ts'
import { chooseLanguage, language, languageSync, storedLanguage, t } from './i18n.ts'
import { LanguageSwitch } from './LanguageSwitch.tsx'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'

const EXPIRED = t('auth.expired')

/** `#add` or `#phone/<id>`, so the browser's back button works on a narrow screen. */
type Route = { view: 'home' } | { view: 'add' } | { view: 'account' } | { view: 'phone'; deviceId: string }

function readRoute(): Route {
    const hash = window.location.hash.slice(1)
    if (hash === 'add') return { view: 'add' }
    if (hash === 'account') return { view: 'account' }
    if (hash.startsWith('phone/')) return { view: 'phone', deviceId: decodeURIComponent(hash.slice(6)) }
    return { view: 'home' }
}

function go(hash: string) {
    window.location.hash = hash
}

function useRoute(): Route {
    const [route, setRoute] = useState(readRoute)
    useEffect(() => {
        const update = () => setRoute(readRoute())
        window.addEventListener('hashchange', update)
        return () => window.removeEventListener('hashchange', update)
    }, [])
    return route
}

function Logo() {
    return (
        <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--brand)" />
            <path d="M13 13h6l1.6 14h-9.2z" fill="var(--brand-ink)" />
            <path d="M12.5 9.5h7v3.5h-7z" fill="var(--lamp)" />
            <path d="M16 5l4 4.5h-8z" fill="var(--brand-ink)" />
        </svg>
    )
}

function AuthForm({ onSubmit, onForgot, notice }: {
    onSubmit: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>
    onForgot: (email: string) => Promise<void>
    notice: string
}) {
    const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [sent, setSent] = useState(false)

    async function submit(event: Event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            if (mode === 'forgot') {
                await onForgot(email.trim())
                setSent(true)
                setBusy(false)
            } else {
                await onSubmit(mode, email.trim(), password)
            }
        } catch (caught) {
            setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
            setBusy(false)
        }
    }

    function switchTo(next: 'login' | 'signup' | 'forgot') {
        setMode(next)
        setError('')
        setSent(false)
    }

    if (mode === 'forgot') {
        return (
            <div class="auth">
                <div class="auth-brand"><Logo /><span>Manara</span></div>
            <LanguageSwitch />
                <form class="card auth-card" onSubmit={submit}>
                    <h1>{t('auth.resetTitle')}</h1>
                    {sent ? (
                        <p role="status" class="banner ok">
                            {t('auth.resetSent', { email: email.trim() })}
                        </p>
                    ) : (
                        <>
                            <p class="muted">{t('auth.resetHelp')}</p>
                            <label>
                                {t('auth.email')}
                                <input type="email" autoComplete="email" required value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
                            </label>
                            <p role="alert" class="error">{error}</p>
                            <button type="submit" class="primary wide" disabled={busy}>{busy ? t('common.pleaseWait') : t('auth.sendLink')}</button>
                        </>
                    )}
                    <button type="button" class="link" onClick={() => switchTo('login')}>{t('auth.backToSignIn')}</button>
                </form>
            </div>
        )
    }

    return (
        <div class="auth">
            <div class="auth-brand">
                <Logo />
                <span>Manara</span>
            </div>
            <LanguageSwitch />
            <form class="card auth-card" onSubmit={submit}>
                <h1>{mode === 'login' ? t('auth.signIn') : t('auth.createTitle')}</h1>
                <p class="muted">{t('auth.tagline')}</p>
                {notice && <p role="status" class="banner">{notice}</p>}
                <label>
                    {t('auth.email')}
                    <input type="email" autoComplete="email" required value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
                </label>
                <label>
                    {t('auth.password')}
                    <input
                        type="password"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        minLength={mode === 'signup' ? 8 : undefined}
                        value={password}
                        onInput={(event) => setPassword(event.currentTarget.value)}
                    />
                    {mode === 'signup' && <span class="muted small">{t('auth.min8')}</span>}
                </label>
                <p role="alert" class="error">{error}</p>
                <button type="submit" class="primary wide" disabled={busy}>
                    {busy ? t('common.pleaseWait') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
                </button>
                <button type="button" class="link" onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}>
                    {mode === 'login' ? t('auth.newHere') : t('auth.haveAccount')}
                </button>
                {mode === 'login' && <button type="button" class="link" onClick={() => switchTo('forgot')}>{t('auth.forgot')}</button>}
            </form>
            <p class="muted small">
                <a href="/privacy.html">{t('auth.privacy')}</a> · <a href="/delete-account.html">{t('auth.deleteLink')}</a> · <a href="/decouvrir.html">{t('auth.about')}</a> · <a href="/guide.html">{t('auth.guide')}</a>
            </p>
        </div>
    )
}

/** The second step of signing in: a code from the authenticator app, or a recovery code. */
function SecondStep({ onCode, onCancel }: { onCode: (code: string) => Promise<void>; onCancel: () => void }) {
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit(event: Event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            await onCode(code.trim())
        } catch (caught) {
            setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
            setBusy(false)
        }
    }

    return (
        <div class="auth">
            <div class="auth-brand"><Logo /><span>Manara</span></div>
            <LanguageSwitch />
            <form class="card auth-card" onSubmit={submit}>
                <h1>{t('auth.twoStepTitle')}</h1>
                <p class="muted">{t('auth.twoStepHelp')}</p>
                <label>
                    {t('auth.code')}
                    <input autoComplete="one-time-code" inputMode="text" required value={code} onInput={(event) => setCode(event.currentTarget.value)} />
                </label>
                <p role="alert" class="error">{error}</p>
                <button type="submit" class="primary wide" disabled={busy}>{busy ? t('common.pleaseWait') : t('auth.signIn')}</button>
                <button type="button" class="link" onClick={onCancel}>{t('common.back')}</button>
            </form>
        </div>
    )
}

function ResetPassword({ token, onReset, onCancel }: { token: string; onReset: (token: string, password: string) => Promise<void>; onCancel: () => void }) {
    const [password, setPassword] = useState('')
    const [again, setAgain] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit(event: Event) {
        event.preventDefault()
        if (password !== again) {
            setError(t('auth.passwordsDiffer'))
            return
        }
        setBusy(true)
        setError('')
        try {
            await onReset(token, password)
        } catch (caught) {
            setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
            setBusy(false)
        }
    }

    return (
        <div class="auth">
            <div class="auth-brand"><Logo /><span>Manara</span></div>
            <LanguageSwitch />
            <form class="card auth-card" onSubmit={submit}>
                <h1>{t('auth.newPasswordTitle')}</h1>
                <p class="muted">{t('auth.newPasswordHelp')}</p>
                <label>
                    {t('auth.newPassword')}
                    <input type="password" autoComplete="new-password" required minLength={8} value={password} onInput={(event) => setPassword(event.currentTarget.value)} />
                    <span class="muted small">{t('auth.min8')}</span>
                </label>
                <label>
                    {t('auth.passwordAgain')}
                    <input type="password" autoComplete="new-password" required minLength={8} value={again} onInput={(event) => setAgain(event.currentTarget.value)} />
                </label>
                <p role="alert" class="error">{error}</p>
                <button type="submit" class="primary wide" disabled={busy}>{busy ? t('common.pleaseWait') : t('auth.saveAndSignIn')}</button>
                <button type="button" class="link" onClick={onCancel}>{t('common.cancel')}</button>
            </form>
        </div>
    )
}

function PhoneList({ devices, selected, onRefresh, error }: { devices: DeviceSummary[] | null; selected: string | null; onRefresh: () => void; error: string }) {
    return (
        <nav class="sidebar" aria-label={t('nav.phones')}>
            <div class="sidebar-head">
                <h2>{t('nav.phones')}</h2>
                <button type="button" class="ghost small" onClick={onRefresh} aria-label={t('nav.refreshPhones')}>{t('common.refresh')}</button>
            </div>
            <button type="button" class="primary wide" onClick={() => go('add')}>{t('nav.addPhone')}</button>
            {error && <p role="alert" class="error">{error}</p>}
            {devices === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : devices.length === 0 ? (
                <p class="muted">{t('nav.noPhones')}</p>
            ) : (
                <ul class="phones">
                    {devices.map((device) => (
                        <li key={device.deviceId}>
                            <a
                                href={`#phone/${encodeURIComponent(device.deviceId)}`}
                                class={device.deviceId === selected ? 'phone active' : 'phone'}
                                aria-current={device.deviceId === selected ? 'page' : undefined}
                            >
                                <span class="avatar" style={{ background: colorHex(device.color) }} aria-hidden="true">
                                    {initial(deviceName(device))}
                                    <span class={`dot ${device.status}`} />
                                </span>
                                <span class="phone-text">
                                    <strong>{deviceName(device)}</strong>
                                    <span class="muted small" title={t('nav.lastSeenTitle', { when: lastSeenText(device.lastSeen) })}>{statusText(device.status)} · {agoText(device.lastSeen)}</span>
                                </span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </nav>
    )
}

function Welcome({ hasPhones }: { hasPhones: boolean }) {
    return (
        <div class="empty">
            <Logo />
            <h2>{hasPhones ? t('nav.choosePhone') : t('nav.welcome')}</h2>
            <p class="muted">
                {hasPhones
                    ? t('nav.choosePhoneHelp')
                    : t('nav.welcomeHelp')}
            </p>
            {!hasPhones && <button type="button" class="primary" onClick={() => go('add')}>{t('nav.addChildPhone')}</button>}
        </div>
    )
}

function Console({ api, onSignOut, onExpired, onDeleted }: { api: Api; onSignOut: () => void; onExpired: () => void; onDeleted: () => void }) {
    const route = useRoute()
    const [devices, setDevices] = useState<DeviceSummary[] | null>(null)
    const [error, setError] = useState('')
    const [reloads, setReloads] = useState(0)

    useEffect(() => {
        let current = true
        api
            .listDevices()
            .then((list) => {
                if (!current) return
                setDevices(list)
                setError('')
            })
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onExpired()
                else setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
            })
        return () => {
            current = false
        }
    }, [api, onExpired, reloads])

    // Once per sign-in: bring this browser and the account to the same language.
    useEffect(() => {
        api.getAccount()
            .then((account) => {
                const { adopt, save } = languageSync(storedLanguage(), language(), account.language)
                if (adopt) chooseLanguage(adopt)
                else if (save) api.setLanguage(save).catch(() => undefined)
            })
            .catch(() => undefined) // the list of phones reports a lost session
    }, [api])

    const refresh = () => {
        setError('')
        setReloads((count) => count + 1)
    }
    const selectedId = route.view === 'phone' ? route.deviceId : null
    const selected = selectedId === null ? undefined : devices?.find((device) => device.deviceId === selectedId)

    let detail
    if (route.view === 'account') {
        detail = <AccountPanel api={api} onSessionExpired={onExpired} onDeleted={onDeleted} />
    } else if (route.view === 'add') {
        detail = <AddDevice api={api} onSessionExpired={onExpired} onDone={() => { refresh(); go('') }} />
    } else if (route.view === 'phone') {
        detail = selected ? (
            <DevicePanel key={selected.deviceId} api={api} device={selected} onSessionExpired={onExpired} onRemoved={() => { refresh(); go('') }} onChanged={refresh} />
        ) : devices === null ? (
            <p class="muted">{t('common.loading')}</p>
        ) : (
            <div class="empty"><h2>{t('nav.notFound')}</h2><p class="muted">{t('nav.notFoundHelp')}</p></div>
        )
    } else {
        detail = <Welcome hasPhones={(devices?.length ?? 0) > 0} />
    }

    return (
        <div class="shell">
            <header class="topbar">
                <a href="#" class="brand"><Logo /><span>Manara</span></a>
                <span class="topbar-actions">
                    <LanguageSwitch onChoose={(lang) => api.setLanguage(lang)} />
                    <a href="#account" class="ghost small button-link">{t('nav.account')}</a>
                    <button type="button" class="ghost small" onClick={onSignOut}>{t('nav.signOut')}</button>
                </span>
            </header>
            <div class={route.view === 'home' ? 'layout' : 'layout has-detail'}>
                <PhoneList devices={devices} selected={selectedId} onRefresh={refresh} error={error} />
                <main class="detail">
                    {route.view !== 'home' && <a href="#" class="back">{t('nav.allPhones')}</a>}
                    {detail}
                </main>
            </div>
        </div>
    )
}

export default function App() {
    const session = useMemo(() => createSessionStore(window.sessionStorage), [])
    const api = useMemo(() => createApi({ baseUrl: API_URL, getToken: () => session.get() }), [session])
    const [signedIn, setSignedIn] = useState(() => session.get() !== null)
    const [notice, setNotice] = useState('')
    // Read once: an emailed link opens the console at #reset=<token>.
    const [reset, setReset] = useState(() => resetToken(window.location.hash))

    const signOut = useCallback(
        (message = '') => {
            session.clear()
            setNotice(message)
            setSignedIn(false)
        },
        [session],
    )
    const expire = useCallback(() => signOut(EXPIRED), [signOut])

    // A sign-in waiting for its second step (two-step sign-in is on).
    const [challenge, setChallenge] = useState<string | null>(null)

    async function authenticate(mode: 'login' | 'signup', email: string, password: string) {
        const result = mode === 'login' ? await api.login(email, password) : await api.signUp(email, password)
        if (needsSecondStep(result)) {
            setChallenge(result.challenge)
            return
        }
        session.set(result.parentSession)
        setNotice('')
        setSignedIn(true)
    }

    async function verify(code: string) {
        if (challenge === null) return
        const result = await api.verifyLogin(challenge, code)
        session.set(result.parentSession)
        setChallenge(null)
        setNotice('')
        setSignedIn(true)
    }

    function leaveReset() {
        // The token must not stay in the address bar or the history.
        window.history.replaceState(null, '', window.location.pathname)
        setReset(null)
    }

    async function confirmReset(token: string, password: string) {
        const result = await api.confirmPasswordReset(token, password)
        leaveReset()
        if (needsSecondStep(result)) {
            setChallenge(result.challenge)
            return
        }
        session.set(result.parentSession)
        setNotice('')
        setSignedIn(true)
    }

    if (reset !== null) return <ResetPassword token={reset} onReset={confirmReset} onCancel={leaveReset} />
    if (challenge !== null && !signedIn) return <SecondStep onCode={verify} onCancel={() => setChallenge(null)} />
    return signedIn ? (
        <Console
            api={api}
            onSignOut={() => {
                // Best effort: the session ends here whether or not the server answers.
                api.logout().catch(() => undefined)
                signOut()
            }}
            onExpired={expire}
            onDeleted={() => { go(''); signOut(t('nav.accountDeleted')) }}
        />
    ) : (
        <AuthForm onSubmit={authenticate} onForgot={(email) => api.requestPasswordReset(email)} notice={notice} />
    )
}
