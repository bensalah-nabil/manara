import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { ApiError, createApi, isSessionError } from './api.ts'
import type { Api, DeviceSummary } from './api.ts'
import { AddDevice } from './AddDevice.tsx'
import { DevicePanel } from './DevicePanel.tsx'
import { agoText, authErrorText, lastSeenText, statusText } from './format.ts'
import { createSessionStore } from './session.ts'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'

const EXPIRED = 'Your session has expired. Please sign in again.'

/** `#add` or `#phone/<id>`, so the browser's back button works on a narrow screen. */
type Route = { view: 'home' } | { view: 'add' } | { view: 'phone'; deviceId: string }

function readRoute(): Route {
    const hash = window.location.hash.slice(1)
    if (hash === 'add') return { view: 'add' }
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

function AuthForm({ onSubmit, notice }: { onSubmit: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>; notice: string }) {
    const [mode, setMode] = useState<'login' | 'signup'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit(event: Event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            await onSubmit(mode, email.trim(), password)
        } catch (caught) {
            setError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
            setBusy(false)
        }
    }

    return (
        <div class="auth">
            <div class="auth-brand">
                <Logo />
                <span>Manara</span>
            </div>
            <form class="card auth-card" onSubmit={submit}>
                <h1>{mode === 'login' ? 'Sign in' : 'Create a parent account'}</h1>
                <p class="muted">Manage your child's phone, openly: the phone always shows what is collected.</p>
                {notice && <p role="status" class="banner">{notice}</p>}
                <label>
                    Email
                    <input type="email" autoComplete="email" required value={email} onInput={(event) => setEmail(event.currentTarget.value)} />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        minLength={mode === 'signup' ? 8 : undefined}
                        value={password}
                        onInput={(event) => setPassword(event.currentTarget.value)}
                    />
                    {mode === 'signup' && <span class="muted small">At least 8 characters.</span>}
                </label>
                <p role="alert" class="error">{error}</p>
                <button type="submit" class="primary wide" disabled={busy}>
                    {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
                </button>
                <button
                    type="button"
                    class="link"
                    onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login')
                        setError('')
                    }}
                >
                    {mode === 'login' ? 'New here? Create an account' : 'I already have an account'}
                </button>
            </form>
        </div>
    )
}

function PhoneList({ devices, selected, onRefresh, error }: { devices: DeviceSummary[] | null; selected: string | null; onRefresh: () => void; error: string }) {
    return (
        <nav class="sidebar" aria-label="Phones">
            <div class="sidebar-head">
                <h2>Phones</h2>
                <button type="button" class="ghost small" onClick={onRefresh} aria-label="Refresh the list of phones">Refresh</button>
            </div>
            <button type="button" class="primary wide" onClick={() => go('add')}>+ Add a phone</button>
            {error && <p role="alert" class="error">{error}</p>}
            {devices === null ? (
                !error && <p class="muted">Loading…</p>
            ) : devices.length === 0 ? (
                <p class="muted">No phones yet. Add your child's phone to get started.</p>
            ) : (
                <ul class="phones">
                    {devices.map((device) => (
                        <li key={device.deviceId}>
                            <a
                                href={`#phone/${encodeURIComponent(device.deviceId)}`}
                                class={device.deviceId === selected ? 'phone active' : 'phone'}
                                aria-current={device.deviceId === selected ? 'page' : undefined}
                            >
                                <span class={`dot ${device.status}`} aria-hidden="true" />
                                <span class="phone-text">
                                    <strong>{device.label || 'Unnamed phone'}</strong>
                                    <span class="muted small" title={`Last seen ${lastSeenText(device.lastSeen)}`}>{statusText(device.status)} · {agoText(device.lastSeen)}</span>
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
            <h2>{hasPhones ? 'Choose a phone' : 'Welcome to Manara'}</h2>
            <p class="muted">
                {hasPhones
                    ? 'Pick a phone from the list to see its activity and change its rules.'
                    : "Connect your child's phone to set screen-time limits, a bedtime and more."}
            </p>
            {!hasPhones && <button type="button" class="primary" onClick={() => go('add')}>Add your child's phone</button>}
        </div>
    )
}

function Console({ api, onSignOut, onExpired }: { api: Api; onSignOut: () => void; onExpired: () => void }) {
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

    const refresh = () => {
        setError('')
        setReloads((count) => count + 1)
    }
    const selectedId = route.view === 'phone' ? route.deviceId : null
    const selected = selectedId === null ? undefined : devices?.find((device) => device.deviceId === selectedId)

    let detail
    if (route.view === 'add') {
        detail = <AddDevice api={api} onSessionExpired={onExpired} onDone={() => { refresh(); go('') }} />
    } else if (route.view === 'phone') {
        detail = selected ? (
            <DevicePanel key={selected.deviceId} api={api} device={selected} onSessionExpired={onExpired} onRemoved={() => { refresh(); go('') }} />
        ) : devices === null ? (
            <p class="muted">Loading…</p>
        ) : (
            <div class="empty"><h2>Phone not found</h2><p class="muted">It may have been removed from this account.</p></div>
        )
    } else {
        detail = <Welcome hasPhones={(devices?.length ?? 0) > 0} />
    }

    return (
        <div class="shell">
            <header class="topbar">
                <a href="#" class="brand"><Logo /><span>Manara</span></a>
                <button type="button" class="ghost small" onClick={onSignOut}>Sign out</button>
            </header>
            <div class={route.view === 'home' ? 'layout' : 'layout has-detail'}>
                <PhoneList devices={devices} selected={selectedId} onRefresh={refresh} error={error} />
                <main class="detail">
                    {route.view !== 'home' && <a href="#" class="back">← All phones</a>}
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

    const signOut = useCallback(
        (message = '') => {
            session.clear()
            setNotice(message)
            setSignedIn(false)
        },
        [session],
    )
    const expire = useCallback(() => signOut(EXPIRED), [signOut])

    async function authenticate(mode: 'login' | 'signup', email: string, password: string) {
        const result = mode === 'login' ? await api.login(email, password) : await api.signUp(email, password)
        session.set(result.parentSession)
        setNotice('')
        setSignedIn(true)
    }

    return signedIn ? <Console api={api} onSignOut={() => signOut()} onExpired={expire} /> : <AuthForm onSubmit={authenticate} notice={notice} />
}
