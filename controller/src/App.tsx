import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, createApi, isSessionError } from './api.ts'
import type { Api, DeviceSummary } from './api.ts'
import { DevicePanel } from './DevicePanel.tsx'
import { authErrorText, lastSeenText, statusText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { createSessionStore } from './session.ts'
import './console.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'

function AuthForm({
  onSubmit,
  notice,
}: {
  onSubmit: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>
  notice: string
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
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
    <form className="card" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Sign in' : 'Create parent account'}</h2>
      {notice && <p role="status" className="notice">{notice}</p>}
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {mode === 'signup' && <p className="hint">At least 8 characters.</p>}
      <p role="alert" className="error">{error}</p>
      <button type="submit" disabled={busy}>
        {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setError('')
        }}
      >
        {mode === 'login' ? 'Create an account' : 'I already have an account'}
      </button>
    </form>
  )
}

function DeviceList({ devices, api, onSessionExpired }: { devices: DeviceSummary[]; api: Api; onSessionExpired: () => void }) {
  if (devices.length === 0) {
    return <p className="hint">No devices yet. Use "Add a device" to enroll one.</p>
  }
  return (
    <ul className="devices">
      {devices.map((device) => (
        <li key={device.deviceId} className="card">
          <strong>{device.label || 'Unnamed device'}</strong>
          <span className={`status ${device.status}`}>{statusText(device.status)}</span>
          <span className="hint">Last seen: {lastSeenText(device.lastSeen)}</span>
          <DevicePanel api={api} device={device} onSessionExpired={onSessionExpired} />
        </li>
      ))}
    </ul>
  )
}

const EXPIRED = 'Your session has expired. Please sign in again.'

function AddDevice({ api, onSessionExpired }: { api: Api; onSessionExpired: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copyNote, setCopyNote] = useState('')

  async function generate() {
    setBusy(true)
    setError('')
    setCopyNote('')
    try {
      setToken(await api.createEnrollmentToken())
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

  if (token === null) {
    return (
      <div className="card">
        <button type="button" onClick={generate} disabled={busy}>
          {busy ? 'Please wait...' : 'Add a device'}
        </button>
        <p role="alert" className="error">{error}</p>
      </div>
    )
  }

  return (
    <div className="card">
      <strong>Enrollment code</strong>
      <QrCode value={token} label="Enrollment code as a QR code" />
      <code className="token">{token}</code>
      <p className="hint">
        On the child's phone, open Manara, choose "Enroll this device", then "Scan QR code" and scan the
        square above, or type the code instead. It works
        once and is shown only now, so generate a new one if it is lost. Enrolled phones always show a
        permanent notice that they are managed.
      </p>
      <div className="row">
        <button type="button" onClick={copy}>Copy</button>
        <button type="button" className="link" onClick={() => setToken(null)}>Done</button>
      </div>
      <p role="status" className="hint">{copyNote}</p>
    </div>
  )
}

function App() {
  const session = useMemo(() => createSessionStore(window.sessionStorage), [])
  const api = useMemo(() => createApi({ baseUrl: API_URL, getToken: () => session.get() }), [session])
  const [signedIn, setSignedIn] = useState(() => session.get() !== null)
  const [notice, setNotice] = useState('')
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloads, setReloads] = useState(0)

  const signOut = useCallback(
    (message = '') => {
      session.clear()
      setDevices(null)
      setLoadError('')
      setNotice(message)
      setSignedIn(false)
    },
    [session],
  )

  const expire = useCallback(() => signOut(EXPIRED), [signOut])

  useEffect(() => {
    if (!signedIn) return
    let current = true
    api
      .listDevices()
      .then((list) => {
        if (!current) return
        setDevices(list)
        setLoadError('')
      })
      .catch((caught: unknown) => {
        if (!current) return
        if (isSessionError(caught)) signOut(EXPIRED)
        else setLoadError(authErrorText(caught instanceof ApiError ? caught.code : 'unknown'))
      })
    return () => {
      current = false
    }
  }, [api, signedIn, signOut, reloads])

  async function authenticate(mode: 'login' | 'signup', email: string, password: string) {
    const result = mode === 'login' ? await api.login(email, password) : await api.signUp(email, password)
    session.set(result.parentSession)
    setNotice('')
    setSignedIn(true)
  }

  return (
    <main>
      <header>
        <h1>Manara</h1>
        {signedIn && (
          <button type="button" className="link" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </header>
      {!signedIn ? (
        <AuthForm onSubmit={authenticate} notice={notice} />
      ) : (
        <section>
          <AddDevice api={api} onSessionExpired={expire} />
          <div className="row">
            <h2>Your devices</h2>
            <button
              type="button"
              onClick={() => {
                setLoadError('')
                setReloads((count) => count + 1)
              }}
            >
              Refresh
            </button>
          </div>
          {loadError && <p role="alert" className="error">{loadError}</p>}
          {devices === null ? !loadError && <p className="hint">Loading...</p> : <DeviceList devices={devices} api={api} onSessionExpired={expire} />}
        </section>
      )}
    </main>
  )
}

export default App
