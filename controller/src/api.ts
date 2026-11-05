export type DeviceStatus = 'reporting' | 'not_reporting' | 'never_connected'
import type { Policy } from './policy.ts'
import type { EventItem } from './protection.ts'

export interface DeviceSummary {
    deviceId: string
    label: string
    status: DeviceStatus
    lastSeen: string
    policyVersion?: number
}

export interface AuthResponse {
    parentId: string
    parentSession: string
}

export class ApiError extends Error {
    readonly status: number
    readonly code: string

    constructor(status: number, code: string, message: string) {
        super(message)
        this.status = status
        this.code = code
    }
}

export function isSessionError(error: unknown): boolean {
    return error instanceof ApiError && (error.status === 401 || error.code === 'no_session')
}

export interface ApiOptions {
    baseUrl: string
    getToken: () => string | null
    fetchImpl?: typeof fetch
}

export function createApi({ baseUrl, getToken, fetchImpl = fetch }: ApiOptions) {
    const root = baseUrl.replace(/\/+$/, '')

    async function request(method: string, path: string, body?: unknown, auth = false): Promise<unknown> {
        const headers: Record<string, string> = {}
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        if (auth) {
            const token = getToken()
            if (!token) throw new ApiError(401, 'no_session', 'Not signed in')
            headers.Authorization = `Bearer ${token}`
        }

        let response: Response
        try {
            response = await fetchImpl(root + path, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
            })
        } catch {
            throw new ApiError(0, 'network', 'Cannot reach the server')
        }

        if (!response.ok) {
            let code = 'http_error'
            let message = ''
            try {
                const error: unknown = await response.json()
                if (error && typeof error === 'object') {
                    const fields = error as { code?: unknown; message?: unknown }
                    if (typeof fields.code === 'string') code = fields.code
                    if (typeof fields.message === 'string') message = fields.message
                }
            } catch {
                // Error body was not JSON; the status code alone is reported.
            }
            throw new ApiError(response.status, code, message)
        }

        try {
            return await response.json()
        } catch {
            throw new ApiError(response.status, 'bad_response', 'Unreadable server response')
        }
    }

    function devicePath(deviceId: string, leaf: string): string {
        return `/console/devices/${encodeURIComponent(deviceId)}/${leaf}`
    }

    function toPolicy(value: unknown): Policy {
        const fields = value as { version?: unknown } | null
        if (!fields || typeof fields !== 'object' || typeof fields.version !== 'number') {
            throw new ApiError(200, 'bad_response', 'Unexpected server response')
        }
        return value as Policy
    }

    function toAuth(value: unknown): AuthResponse {
        const fields = value as Partial<AuthResponse> | null
        if (!fields || typeof fields.parentId !== 'string' || typeof fields.parentSession !== 'string') {
            throw new ApiError(200, 'bad_response', 'Unexpected server response')
        }
        return { parentId: fields.parentId, parentSession: fields.parentSession }
    }

    return {
        async login(email: string, password: string): Promise<AuthResponse> {
            return toAuth(await request('POST', '/console/auth/login', { email, password }))
        },

        async signUp(email: string, password: string): Promise<AuthResponse> {
            return toAuth(await request('POST', '/console/auth/signup', { email, password }))
        },

        async listDevices(): Promise<DeviceSummary[]> {
            const value = await request('GET', '/console/devices', undefined, true)
            if (!Array.isArray(value)) throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return value as DeviceSummary[]
        },

        async createEnrollmentToken(): Promise<string> {
            const value = (await request('POST', '/console/enrollment-tokens', undefined, true)) as {
                enrollmentToken?: unknown
            } | null
            if (!value || typeof value.enrollmentToken !== 'string' || value.enrollmentToken === '') {
                throw new ApiError(200, 'bad_response', 'Unexpected server response')
            }
            return value.enrollmentToken
        },

        async getPolicy(deviceId: string): Promise<Policy> {
            const value = await request('GET', devicePath(deviceId, 'policy'), undefined, true)
            return toPolicy(value)
        },

        async setPolicy(deviceId: string, policy: Policy): Promise<Policy> {
            return toPolicy(await request('PUT', devicePath(deviceId, 'policy'), policy, true))
        },

        async lockNow(deviceId: string): Promise<void> {
            await request('POST', devicePath(deviceId, 'commands'), { type: 'lock_now' }, true)
        },

        async listEvents(deviceId: string, kind: string): Promise<EventItem[]> {
            const query = `?kind=${encodeURIComponent(kind)}`
            const value = await request('GET', devicePath(deviceId, 'events') + query, undefined, true)
            if (!Array.isArray(value)) throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return value as EventItem[]
        },
    }
}

export type Api = ReturnType<typeof createApi>
