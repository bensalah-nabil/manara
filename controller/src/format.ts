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

/** "just now", "5 min ago", "3 h ago", "yesterday", then the date. Exact time stays in [lastSeenText]. */
export function agoText(iso: string, now: number = Date.now(), locale?: string): string {
    const time = Date.parse(iso)
    if (Number.isNaN(time) || time < Date.UTC(2000, 0, 1)) return 'never'
    const minutes = Math.floor((now - time) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} h ago`
    if (hours < 48) return 'yesterday'
    return new Date(time).toLocaleDateString(locale)
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
        case 'invalid_browser_rules':
            return 'One of the Chrome rules is not valid. Check the website list.'
        case 'rate_limited':
            return 'Too many attempts. Wait a few minutes, then try again.'
        case 'weak_password':
            return 'Choose a password of at least 8 characters.'
        case 'invalid_reset_token':
            return 'This reset link is invalid, already used, or older than one hour. Ask for a new one.'
        case 'email_unavailable':
            return "This server can't send email, so password reset is not available. Contact the person who runs it."
        case 'wrong_password':
            return 'That password is not right.'
        case 'devices_remain':
            return 'Release or remove every phone first.'
        default:
            return 'Something went wrong. Please try again.'
    }
}

export function errorText(error: unknown): string {
    if (error instanceof ApiError && error.status === 404) return 'That device no longer exists.'
    return authErrorText(error instanceof ApiError ? error.code : 'unknown')
}

const MAKERS: Record<string, string> = { samsung: 'Samsung', xiaomi: 'Xiaomi', google: 'Google', oppo: 'OPPO', vivo: 'vivo', huawei: 'Huawei', honor: 'HONOR', motorola: 'Motorola', oneplus: 'OnePlus', nokia: 'Nokia', realme: 'realme', tecno: 'TECNO', infinix: 'Infinix' }

/** The parent's label, else the phone's maker and model ("Samsung SM-A045F"), else a placeholder. */
export function deviceName(device: { label?: string; model?: string; manufacturer?: string }, fallback = 'Unnamed phone'): string {
    const label = device.label?.trim()
    if (label) return label
    const model = device.model?.trim() ?? ''
    const raw = device.manufacturer?.trim() ?? ''
    const maker = MAKERS[raw.toLowerCase()] ?? raw
    if (!model) return maker || fallback
    return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model
}
