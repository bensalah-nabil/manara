import { useEffect, useMemo, useState } from 'preact/hooks'
import { configured, startAuth } from './auth.ts'
import type { Auth } from './auth.ts'
import { createApi, NotAdmin } from './api.ts'
import type { Account, Api, LogEntry, Overview, Phone } from './api.ts'
import { ACTION_TEXT, agoText, PROBLEM_TEXT, phoneProblem } from './model.ts'

type View = 'overview' | 'accounts' | 'phones' | 'log'

const VIEWS: { key: View; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'phones', label: 'Phones' },
    { key: 'log', label: 'Admin log' },
]

export function App() {
    const [auth, setAuth] = useState<Auth | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!configured) return
        startAuth().then(setAuth).catch((caught) => setError(String(caught)))
    }, [])

    if (!configured) {
        return <Shell><p class="card">This build has no Entra ID app set (VITE_ENTRA_TENANT_ID, VITE_ENTRA_CLIENT_ID). See docs/admin-console.md.</p></Shell>
    }
    if (error) return <Shell><p role="alert" class="card error">{error}</p></Shell>
    if (auth === null) return <Shell><p class="muted">Loading…</p></Shell>
    if (auth.account === null) {
        return (
            <Shell>
                <div class="card narrow">
                    <h1>Manara admin</h1>
                    <p class="muted">For the people who run Manara. Parents use the console instead.</p>
                    <button type="button" class="primary" onClick={() => void auth.signIn()}>Sign in with Microsoft</button>
                </div>
            </Shell>
        )
    }
    return <Console auth={auth} />
}

function Shell({ children, right }: { children: preact.ComponentChildren; right?: preact.ComponentChildren }) {
    return (
        <>
            <header class="top"><b>Manara admin</b><span>{right}</span></header>
            <main>{children}</main>
        </>
    )
}

function Console({ auth }: { auth: Auth }) {
    const api = useMemo(() => createApi(() => auth.token()), [auth])
    const [view, setView] = useState<View>('overview')
    const [refused, setRefused] = useState(false)
    const [me, setMe] = useState('')

    useEffect(() => {
        api.me().then((who) => setMe(who.name)).catch((caught) => { if (caught instanceof NotAdmin) setRefused(true) })
    }, [api])

    const signOut = <button type="button" class="ghost" onClick={() => void auth.signOut()}>Sign out</button>
    if (refused) {
        return (
            <Shell right={signOut}>
                <div class="card narrow">
                    <h1>Not an admin</h1>
                    <p>The server refused this Microsoft account ({auth.account?.username}). Its object id must be in ADMIN_ALLOWED_OIDS on the server.</p>
                </div>
            </Shell>
        )
    }
    return (
        <Shell right={<>{me && <span class="muted">{me}</span>} {signOut}</>}>
            <nav class="tabs" role="tablist">
                {VIEWS.map(({ key, label }) => (
                    <button key={key} type="button" role="tab" aria-selected={view === key} class={view === key ? 'tab active' : 'tab'} onClick={() => setView(key)}>{label}</button>
                ))}
            </nav>
            <p class="muted small">Accounts, phones and problems only: nothing a phone reports about a child. Every page you open is recorded in the admin log.</p>
            {view === 'overview' && <OverviewView api={api} />}
            {view === 'accounts' && <AccountsView api={api} />}
            {view === 'phones' && <PhonesView api={api} accountId="" />}
            {view === 'log' && <LogView api={api} />}
        </Shell>
    )
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { value: T | null; error: string } {
    const [value, setValue] = useState<T | null>(null)
    const [error, setError] = useState('')
    useEffect(() => {
        let current = true
        setValue(null)
        setError('')
        load().then((v) => { if (current) setValue(v) }).catch((caught) => { if (current) setError(caught instanceof Error ? caught.message : String(caught)) })
        return () => { current = false }
    }, deps)
    return { value, error }
}

function Loading({ error }: { error: string }) {
    return error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>
}

function OverviewView({ api }: { api: Api }) {
    const overview = useLoad<Overview>(() => api.overview(), [api])
    const phones = useLoad<Phone[]>(() => api.phones(), [api])
    const o = overview.value
    if (!o) return <Loading error={overview.error} />
    const now = Date.now()
    const attention = (phones.value ?? []).filter((phone) => phoneProblem(phone, now) !== null)
    const tiles: [string, number, string][] = [
        ['Accounts', o.accounts, `${o.newAccounts7d} new this week`],
        ['Two-step sign-in on', o.accountsWithTwoStep, `of ${o.accounts} accounts`],
        ['Phones', o.phones, `${o.phonesSeen24h} checked in today`],
        ['Not reporting', o.silentPhones, 'quiet longer than the alert threshold'],
        ['Setups in progress', o.setupsUnfinished, 'not finished yet'],
        ['Setups failed', o.setupsFailed, 'need a look'],
    ]
    return (
        <>
            <div class="tiles">
                {tiles.map(([label, n, note]) => (
                    <div key={label} class={label === 'Not reporting' || label === 'Setups failed' ? (n > 0 ? 'tile warn' : 'tile') : 'tile'}>
                        <span class="muted small">{label}</span><b>{n}</b><span class="muted small">{note}</span>
                    </div>
                ))}
            </div>
            <h2>Needs attention</h2>
            {phones.value === null ? <Loading error={phones.error} /> : attention.length === 0 ? <p class="muted">Nothing: every phone is reporting and no setup is failing.</p> : <PhoneTable phones={attention} now={now} />}
        </>
    )
}

function AccountsView({ api }: { api: Api }) {
    const [query, setQuery] = useState('')
    const [search, setSearch] = useState('')
    const [open, setOpen] = useState<Account | null>(null)
    const accounts = useLoad<Account[]>(() => api.accounts(search), [api, search])
    const now = Date.now()
    if (open) {
        return (
            <>
                <button type="button" class="ghost" onClick={() => setOpen(null)}>← All accounts</button>
                <h2>{open.email}</h2>
                <p class="muted">Created {new Date(open.createdAt).toLocaleDateString()} · language {open.language} · two-step {open.twoStep ? 'on' : 'off'} · last sign-in {agoText(open.lastSignIn, now)}</p>
                <PhonesView api={api} accountId={open.id} />
            </>
        )
    }
    return (
        <>
            <form class="search" onSubmit={(event) => { event.preventDefault(); setSearch(query) }}>
                <input type="search" placeholder="Part of an email" value={query} onInput={(event) => setQuery(event.currentTarget.value)} aria-label="Search accounts by email" />
                <button type="submit">Search</button>
            </form>
            {accounts.value === null ? <Loading error={accounts.error} /> : (
                <div class="scroll">
                    <table>
                        <thead><tr><th>Email</th><th>Created</th><th>Phones</th><th>Two-step</th><th>Last sign-in</th></tr></thead>
                        <tbody>
                            {accounts.value.map((a) => (
                                <tr key={a.id} class="link-row" onClick={() => setOpen(a)}>
                                    <td><button type="button" class="link">{a.email || '(no email)'}</button></td>
                                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                                    <td>{a.phones}</td>
                                    <td>{a.twoStep ? 'on' : 'off'}</td>
                                    <td>{agoText(a.lastSignIn, now)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {accounts.value.length === 0 && <p class="muted">No account matches.</p>}
                </div>
            )}
        </>
    )
}

function PhonesView({ api, accountId }: { api: Api; accountId: string }) {
    const phones = useLoad<Phone[]>(() => api.phones(accountId), [api, accountId])
    if (phones.value === null) return <Loading error={phones.error} />
    if (phones.value.length === 0) return <p class="muted">No phones.</p>
    return <PhoneTable phones={phones.value} now={Date.now()} />
}

function PhoneTable({ phones, now }: { phones: Phone[]; now: number }) {
    return (
        <div class="scroll">
            <table>
                <thead><tr><th>Phone</th><th>Account</th><th>Android</th><th>Manara</th><th>Last check-in</th><th>Setup</th><th>Problem</th></tr></thead>
                <tbody>
                    {phones.map((p) => {
                        const problem = phoneProblem(p, now)
                        return (
                            <tr key={p.id}>
                                <td>{[p.manufacturer, p.model].filter(Boolean).join(' ') || 'Unknown'}</td>
                                <td>{p.accountEmail}</td>
                                <td>{p.androidVersion || '–'}</td>
                                <td>{p.agentVersion || '–'}</td>
                                <td>{agoText(p.lastSeen, now)}</td>
                                <td>{p.setupStatus ? `${p.setupStep} · ${p.setupStatus}` : '–'}{p.setupMessage && <div class="muted small">{p.setupMessage}</div>}</td>
                                <td>{problem ? <span class="pill warn">{PROBLEM_TEXT[problem]}</span> : <span class="pill ok">OK</span>}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function LogView({ api }: { api: Api }) {
    const entries = useLoad<LogEntry[]>(() => api.log(), [api])
    if (entries.value === null) return <Loading error={entries.error} />
    return (
        <div class="scroll">
            <table>
                <thead><tr><th>When</th><th>Admin</th><th>What</th><th>Detail</th></tr></thead>
                <tbody>
                    {entries.value.map((e, i) => (
                        <tr key={i}>
                            <td>{new Date(e.at).toLocaleString()}</td>
                            <td>{e.adminName || e.adminId}</td>
                            <td>{ACTION_TEXT[e.action] ?? e.action}</td>
                            <td>{e.target}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
