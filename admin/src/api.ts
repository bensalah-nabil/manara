const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1').replace(/\/+$/, '')

export interface Overview {
    accounts: number
    accountsWithTwoStep: number
    newAccounts7d: number
    phones: number
    phonesSeen24h: number
    silentPhones: number
    setupsUnfinished: number
    setupsFailed: number
}

export interface Account {
    id: string
    email: string
    createdAt: string
    language: string
    twoStep: boolean
    phones: number
    lastSignIn?: string
    /** Set while an admin has suspended the account. */
    suspendedAt?: string
}

export interface AgentUpdate {
    versionCode: number
    versionName: string
    url: string
    sha256: string
}

export interface AgentUpdateState {
    /** What phones are told now; null while updates are held. */
    offered: AgentUpdate | null
    /** The admin console's choice; null when Render's settings apply. */
    setting: { paused: boolean; versionCode?: number; versionName?: string; sha256?: string } | null
    /** Render's AGENT_UPDATE_* settings. */
    fallback: AgentUpdate | null
}

export interface SiteNotice {
    level: 'info' | 'warning'
    text: Record<string, string>
    until?: string
}

/** Every action needs a reason, kept in the admin log, and most a typed confirmation. */
export interface ActionBody {
    reason: string
    confirm?: string
    versionCode?: number
    versionName?: string
    sha256?: string
    notice?: SiteNotice
}

export interface AdminStats {
    days: { date: string; newAccounts: number; newPhones: number; activePhones: number }[]
    versions: { label: string; count: number }[]
    android: { label: string; count: number }[]
    brands: { label: string; count: number }[]
    funnel: { phones: number; setupStarted: number; inProgress: number; waitingForParent: number; finished: number; failed: number }
    failures: { label: string; count: number }[]
    alerts: { date: string; kind: string; sent: number; undelivered: number }[]
    emailsFailing: number
}

export class ActionError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
        super(message)
        this.code = code
    }
}

export interface Phone {
    id: string
    accountId: string
    accountEmail: string
    manufacturer: string
    model: string
    androidVersion: string
    agentVersion: string
    createdAt: string
    lastSeen?: string
    setupStep?: string
    setupStatus?: string
    setupMessage?: string
    setupUpdatedAt?: string
}

export interface LogEntry {
    adminId: string
    adminName: string
    action: string
    target: string
    at: string
}

export class NotAdmin extends Error {}

export function createApi(token: () => Promise<string>) {
    async function get<T>(path: string): Promise<T> {
        const response = await fetch(API_URL + path, { headers: { Authorization: `Bearer ${await token()}` } })
        if (response.status === 401) throw new NotAdmin()
        if (response.status === 404) throw new Error('The admin API is off on this server: set the three ADMIN_ settings on Render (docs/admin-console.md).')
        if (!response.ok) throw new Error(`The server answered ${response.status}.`)
        return (await response.json()) as T
    }
    async function send<T>(method: string, path: string, body: ActionBody): Promise<T> {
        const response = await fetch(API_URL + path, {
            method,
            headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (response.status === 401) throw new NotAdmin()
        const value = (await response.json().catch(() => null)) as { code?: string; message?: string } | null
        if (!response.ok) throw new ActionError(value?.code ?? 'http_error', value?.message || `The server answered ${response.status}.`)
        return value as T
    }
    const done = (method: string, path: string, body: ActionBody) => send<{ done: boolean }>(method, path, body)
    const account = (id: string, action: string, body: ActionBody) => done('POST', `/admin/accounts/${encodeURIComponent(id)}/${action}`, body)
    const phone = (id: string, action: string, body: ActionBody) => done('POST', `/admin/phones/${encodeURIComponent(id)}/${action}`, body)
    return {
        twoStepOff: (id: string, body: ActionBody) => account(id, 'two-step-off', body),
        passwordReset: (id: string, body: ActionBody) => account(id, 'password-reset', body),
        suspend: (id: string, body: ActionBody) => account(id, 'suspend', body),
        reactivate: (id: string, body: ActionBody) => account(id, 'reactivate', body),
        deleteAccount: (id: string, body: ActionBody) => account(id, 'delete', body),
        resetSetup: (id: string, body: ActionBody) => phone(id, 'setup-reset', body),
        removePhone: (id: string, body: ActionBody) => phone(id, 'remove', body),
        agentUpdate: () => get<AgentUpdateState>('/admin/agent-update'),
        offerVersion: (body: ActionBody) => done('PUT', '/admin/agent-update', body),
        pauseUpdates: (body: ActionBody) => done('POST', '/admin/agent-update/pause', body),
        updatesFromServer: (body: ActionBody) => done('DELETE', '/admin/agent-update', body),
        notice: () => get<{ notice: SiteNotice | null }>('/admin/notice'),
        setNotice: (body: ActionBody) => done('PUT', '/admin/notice', body),
        clearNotice: (body: ActionBody) => done('DELETE', '/admin/notice', body),
        me: () => get<{ id: string; name: string }>('/admin/me'),
        overview: () => get<Overview>('/admin/overview'),
        accounts: (query: string) => get<Account[]>(`/admin/accounts?q=${encodeURIComponent(query)}`),
        phones: (accountId = '') => get<Phone[]>(`/admin/phones?account=${encodeURIComponent(accountId)}`),
        log: () => get<LogEntry[]>('/admin/log'),
        stats: (days: number) => get<AdminStats>(`/admin/stats?days=${days}`),
    }
}

export type Api = ReturnType<typeof createApi>
