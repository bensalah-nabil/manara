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
    return {
        me: () => get<{ id: string; name: string }>('/admin/me'),
        overview: () => get<Overview>('/admin/overview'),
        accounts: (query: string) => get<Account[]>(`/admin/accounts?q=${encodeURIComponent(query)}`),
        phones: (accountId = '') => get<Phone[]>(`/admin/phones?account=${encodeURIComponent(accountId)}`),
        log: () => get<LogEntry[]>('/admin/log'),
    }
}

export type Api = ReturnType<typeof createApi>
