export type DeviceStatus = 'reporting' | 'not_reporting' | 'never_connected'
import type { Policy } from './policy.ts'
import type { EventItem } from './protection.ts'
import type { DeviceSetup } from './setup.ts'

/** The parent's own account, as the Account page shows it. */
export interface Account {
    email: string
    /** Phones still on the account; deleting it waits until this is 0. */
    phones: number
    /** False when the server cannot send email, so password reset is off. */
    passwordReset: boolean
    /** Two-step sign-in with an authenticator app is on. */
    twoFactor: boolean
}

/** The password was right and two-step sign-in is on: send a code with this challenge. */
export interface TwoFactorChallenge {
    challenge: string
}

export function needsSecondStep(result: AuthResponse | TwoFactorChallenge): result is TwoFactorChallenge {
    return 'challenge' in result
}

export interface DeviceSummary {
    deviceId: string
    label: string
    /** One of profile.ts COLORS, or absent until the parent picks one. */
    color?: string
    model?: string
    manufacturer?: string
    status: DeviceStatus
    lastSeen: string
    policyVersion?: number
}

export type ReleaseMode = 'transfer' | 'remove'

export interface ReleaseCode {
    code: string
    validUntil: string
    /** False until the phone has received the key that checks the code. */
    phoneReady: boolean
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

export interface EnrollmentRequest {
    attestation: { parentOrGuardian: boolean; minorChild: boolean; childInformed: boolean }
    version: string
    phoneBrand: string
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

        // 204 No Content (logout) has no body to read.
        if (response.status === 204) return null
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

    function toSignIn(value: unknown): AuthResponse | TwoFactorChallenge {
        const fields = value as { twoFactorRequired?: unknown; challenge?: unknown } | null
        if (fields && fields.twoFactorRequired === true) {
            if (typeof fields.challenge !== 'string') throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return { challenge: fields.challenge }
        }
        return toAuth(value)
    }

    function toAuth(value: unknown): AuthResponse {
        const fields = value as Partial<AuthResponse> | null
        if (!fields || typeof fields.parentId !== 'string' || typeof fields.parentSession !== 'string') {
            throw new ApiError(200, 'bad_response', 'Unexpected server response')
        }
        return { parentId: fields.parentId, parentSession: fields.parentSession }
    }

    return {
        /** A session, or a challenge when two-step sign-in is on. */
        async login(email: string, password: string): Promise<AuthResponse | TwoFactorChallenge> {
            return toSignIn(await request('POST', '/console/auth/login', { email, password }))
        },

        /** The second step: a code from the authenticator app, or a recovery code. */
        async verifyLogin(challenge: string, code: string): Promise<AuthResponse> {
            return toAuth(await request('POST', '/console/auth/login/verify', { challenge, code }))
        },

        /** Needs the password; returns the secret for the authenticator app, not yet in use. */
        async setupTwoFactor(password: string): Promise<{ secret: string; uri: string }> {
            const value = (await request('POST', '/console/account/two-factor/setup', { password }, true)) as { secret?: unknown; uri?: unknown } | null
            if (!value || typeof value.secret !== 'string' || typeof value.uri !== 'string') throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return { secret: value.secret, uri: value.uri }
        },

        /** Turns it on with a first code; returns the recovery codes, shown once. */
        async enableTwoFactor(code: string): Promise<string[]> {
            const value = (await request('POST', '/console/account/two-factor/enable', { code }, true)) as { recoveryCodes?: unknown } | null
            if (!value || !Array.isArray(value.recoveryCodes)) throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return value.recoveryCodes.filter((c): c is string => typeof c === 'string')
        },

        async disableTwoFactor(password: string, code: string): Promise<void> {
            await request('POST', '/console/account/two-factor/disable', { password, code }, true)
        },

        async signUp(email: string, password: string): Promise<AuthResponse> {
            return toAuth(await request('POST', '/console/auth/signup', { email, password }))
        },

        /** Ends this session on the server too, so a copied token stops working. */
        async logout(): Promise<void> {
            await request('POST', '/console/auth/logout', undefined, true)
        },

        /** Always succeeds the same way for any address; the link only goes to a real account. */
        async requestPasswordReset(email: string): Promise<void> {
            await request('POST', '/console/auth/password-reset', { email })
        },

        /** Sets the new password from an emailed link and signs in; every other session ends. */
        async confirmPasswordReset(token: string, password: string): Promise<AuthResponse | TwoFactorChallenge> {
            return toSignIn(await request('POST', '/console/auth/password-reset/confirm', { token, password }))
        },

        async getAccount(): Promise<Account> {
            const value = (await request('GET', '/console/account', undefined, true)) as Partial<Account> | null
            if (!value || typeof value.email !== 'string' || typeof value.phones !== 'number') {
                throw new ApiError(200, 'bad_response', 'Unexpected server response')
            }
            return { email: value.email, phones: value.phones, passwordReset: value.passwordReset === true, twoFactor: value.twoFactor === true }
        },

        /** Needs the password again. Refused (devices_remain) while any phone is still on the account. */
        async deleteAccount(password: string): Promise<void> {
            await request('DELETE', '/console/account', { password }, true)
        },

        async listDevices(): Promise<DeviceSummary[]> {
            const value = await request('GET', '/console/devices', undefined, true)
            if (!Array.isArray(value)) throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return value as DeviceSummary[]
        },

        async createEnrollmentToken(input: EnrollmentRequest): Promise<string> {
            const body = {
                attestation: { ...input.attestation, version: input.version },
                phoneBrand: input.phoneBrand,
            }
            const value = (await request('POST', '/console/enrollment-tokens', body, true)) as {
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

        /** The stored policy, and whether a push woke the phone to fetch it now. */
        async setPolicy(deviceId: string, policy: Policy): Promise<{ policy: Policy; woken: boolean }> {
            const { woken, ...stored } = toPolicy(await request('PUT', devicePath(deviceId, 'policy'), policy, true)) as Policy & { woken?: unknown }
            return { policy: stored as Policy, woken: woken === true }
        },

        /** The child's name and color for this phone. */
        async updateDevice(deviceId: string, profile: { label: string; color: string }): Promise<void> {
            await request('PATCH', `/console/devices/${encodeURIComponent(deviceId)}`, profile, true)
        },

        /** True when the server woke the phone with a push; false means it locks at its next check-in. */
        async lockNow(deviceId: string): Promise<{ woken: boolean }> {
            const value = (await request('POST', devicePath(deviceId, 'commands'), { type: 'lock_now' }, true)) as { woken?: unknown } | null
            return { woken: value?.woken === true }
        },

        async listEvents(deviceId: string, kind: string, since?: Date): Promise<EventItem[]> {
            const query = `?kind=${encodeURIComponent(kind)}` + (since ? `&since=${encodeURIComponent(since.toISOString())}` : '')
            const value = await request('GET', devicePath(deviceId, 'events') + query, undefined, true)
            if (!Array.isArray(value)) throw new ApiError(200, 'bad_response', 'Unexpected server response')
            return value as EventItem[]
        },

        /** Null until the phone reports its first setup step. */
        async getSetup(deviceId: string): Promise<DeviceSetup | null> {
            const value = await request('GET', devicePath(deviceId, 'setup'), undefined, true)
            if (value === null) return null
            const setup = value as Partial<DeviceSetup>
            if (typeof setup.step !== 'string' || typeof setup.status !== 'string') {
                throw new ApiError(200, 'bad_response', 'Unexpected server response')
            }
            return {
                ...(setup as DeviceSetup),
                message: typeof setup.message === 'string' ? setup.message : '',
                initialAccounts: Array.isArray(setup.initialAccounts) ? setup.initialAccounts : [],
                currentAccounts: Array.isArray(setup.currentAccounts) ? setup.currentAccounts : [],
                pairingQr: typeof setup.pairingQr === 'string' && setup.pairingQr ? setup.pairingQr : undefined,
                finishRequested: setup.finishRequested === true,
            }
        },

        /** Asks the phone to leave this account: `transfer` keeps it set up for another account, `remove` ends management. */
        async release(deviceId: string, mode: ReleaseMode): Promise<void> {
            await request('POST', devicePath(deviceId, 'commands'), { type: 'release', params: { mode } }, true)
        },

        /** The code a parent types on a phone that can't be reached. */
        async getReleaseCode(deviceId: string): Promise<ReleaseCode> {
            const value = (await request('GET', devicePath(deviceId, 'release-code'), undefined, true)) as Partial<ReleaseCode> | null
            if (!value || typeof value.code !== 'string' || typeof value.validUntil !== 'string' || typeof value.phoneReady !== 'boolean') {
                throw new ApiError(200, 'bad_response', 'Unexpected server response')
            }
            return { code: value.code, validUntil: value.validUntil, phoneReady: value.phoneReady }
        },

        /** Removes the phone from the account. It stays managed until it has been released. */
        async deleteDevice(deviceId: string): Promise<void> {
            await request('DELETE', `/console/devices/${encodeURIComponent(deviceId)}`, undefined, true)
        },

        /** The code the phone's "Pair device with pairing code" screen shows; the phone reads it. */
        async sendPairingCode(deviceId: string, code: string): Promise<void> {
            await request('POST', devicePath(deviceId, 'setup/pairing-code'), { code }, true)
        },

        /** Ends setup once the parent has signed back in to the accounts they want. */
        async finishSetup(deviceId: string): Promise<void> {
            await request('POST', devicePath(deviceId, 'setup/finish'), undefined, true)
        },

        async clearSetupAccounts(deviceId: string): Promise<void> {
            await request('DELETE', devicePath(deviceId, 'setup/accounts'), undefined, true)
        },
    }
}

export type Api = ReturnType<typeof createApi>
