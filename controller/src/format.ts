import { ApiError } from './api.ts'
import type { DeviceStatus } from './api.ts'
import { dateLocale, t } from './i18n.ts'

const STATUS_TEXT: Record<DeviceStatus, string> = {
    reporting: t('status.reporting'),
    not_reporting: t('status.notReporting'),
    never_connected: t('status.neverConnected'),
}

export function statusText(status: string): string {
    return STATUS_TEXT[status as DeviceStatus] ?? t('status.unknown')
}

/** The backend sends a zero timestamp for a device that has never checked in. */
export function lastSeenText(iso: string, locale?: string): string {
    const time = Date.parse(iso)
    if (Number.isNaN(time) || time < Date.UTC(2000, 0, 1)) return t('time.never')
    return new Date(time).toLocaleString(locale ?? dateLocale())
}

/** "just now", "5 min ago", "3 h ago", "yesterday", then the date. Exact time stays in [lastSeenText]. */
export function agoText(iso: string, now: number = Date.now(), locale?: string): string {
    const time = Date.parse(iso)
    if (Number.isNaN(time) || time < Date.UTC(2000, 0, 1)) return t('time.neverLower')
    const minutes = Math.floor((now - time) / 60000)
    if (minutes < 1) return t('time.justNow')
    if (minutes < 60) return t('time.minAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('time.hAgo', { n: hours })
    if (hours < 48) return t('time.yesterday')
    return new Date(time).toLocaleDateString(locale ?? dateLocale())
}

export function authErrorText(code: string): string {
    switch (code) {
        case 'invalid_credentials':
            return t('err.invalidCredentials')
        case 'email_taken':
            return t('err.emailTaken')
        case 'network':
            return t('err.network')
        case 'attestation_required':
            return t('err.attestationRequired')
        case 'attestation_outdated':
            return t('err.attestationOutdated')
        case 'unknown_phone_brand':
            return t('err.unknownBrand')
        case 'invalid_browser_rules':
            return t('err.browserRules')
        case 'bad_code':
            return t('err.badCode')
        case 'invalid_challenge':
            return t('err.invalidChallenge')
        case 'setup_first':
            return t('err.setupFirst')
        case 'rate_limited':
            return t('err.rateLimited')
        case 'weak_password':
            return t('err.weakPassword')
        case 'invalid_reset_token':
            return t('err.invalidResetToken')
        case 'email_unavailable':
            return t('err.emailUnavailable')
        case 'wrong_password':
            return t('err.wrongPassword')
        case 'devices_remain':
            return t('err.devicesRemain')
        default:
            return t('err.default')
    }
}

export function errorText(error: unknown): string {
    if (error instanceof ApiError && error.status === 404) return t('err.deviceGone')
    return authErrorText(error instanceof ApiError ? error.code : 'unknown')
}

const MAKERS: Record<string, string> = { samsung: 'Samsung', xiaomi: 'Xiaomi', google: 'Google', oppo: 'OPPO', vivo: 'vivo', huawei: 'Huawei', honor: 'HONOR', motorola: 'Motorola', oneplus: 'OnePlus', nokia: 'Nokia', realme: 'realme', tecno: 'TECNO', infinix: 'Infinix' }

/** The parent's label, else the phone's maker and model ("Samsung SM-A045F"), else a placeholder. */
export function deviceName(device: { label?: string; model?: string; manufacturer?: string }, fallback = t('device.unnamed')): string {
    const label = device.label?.trim()
    if (label) return label
    const model = device.model?.trim() ?? ''
    const raw = device.manufacturer?.trim() ?? ''
    const maker = MAKERS[raw.toLowerCase()] ?? raw
    if (!model) return maker || fallback
    return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model
}
