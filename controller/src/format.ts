import { ApiError } from './api.ts'
import type { DeviceStatus } from './api.ts'

const STATUS_TEXT: Record<DeviceStatus, string> = {
    reporting: 'Reporting',
    not_reporting: 'Not reporting',
    never_connected: 'Never connected',
}

export function statusText(status: string): string {
    return STATUS_TEXT[status as DeviceStatus] ?? 'Unknown'
}

/** The backend sends a zero timestamp for a device that has never checked in. */
export function lastSeenText(iso: string, locale?: string): string {
    const time = Date.parse(iso)
    if (Number.isNaN(time) || time < Date.UTC(2000, 0, 1)) return 'Never'
    return new Date(time).toLocaleString(locale)
}

export function authErrorText(code: string): string {
    switch (code) {
        case 'invalid_credentials':
            return 'Incorrect email or password.'
        case 'email_taken':
            return 'That email is already registered.'
        case 'network':
            return 'Cannot reach the server. Check your connection and try again.'
        case 'attestation_required':
            return 'Please confirm all three statements about your child\'s phone.'
        case 'attestation_outdated':
            return 'The statements were updated. Reload the page and confirm them again.'
        case 'unknown_phone_brand':
            return 'Please choose the phone brand again.'
        default:
            return 'Something went wrong. Please try again.'
    }
}

export function errorText(error: unknown): string {
    if (error instanceof ApiError && error.status === 404) return 'That device no longer exists.'
    return authErrorText(error instanceof ApiError ? error.code : 'unknown')
}
