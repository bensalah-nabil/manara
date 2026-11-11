import { t } from './i18n.ts'
/** Must equal domain.AttestationVersion on the server; a mismatch makes the server reject the code request. */
export const ATTESTATION_VERSION = '2026-11-06'

export type StatementKey = 'parentOrGuardian' | 'minorChild' | 'childInformed'

export const STATEMENTS: { key: StatementKey; text: string }[] = [
    { key: 'parentOrGuardian', text: t('enroll.statement.parent') },
    { key: 'minorChild', text: t('enroll.statement.minor') },
    {
        key: 'childInformed',
        text: t('enroll.statement.informed'),
    },
]

export type Attestation = Record<StatementKey, boolean>

export function noAttestation(): Attestation {
    return { parentOrGuardian: false, minorChild: false, childInformed: false }
}

export function attestationComplete(attestation: Attestation): boolean {
    return STATEMENTS.every(({ key }) => attestation[key])
}

/**
 * What setup does with the phone's accounts on this brand (ADR-0006): "paused" means the apps holding
 * them are paused for a few seconds and nothing is removed; "removed" means the accounts themselves
 * have to be removed for a moment and signed back in (every Samsung tested so far); "unknown" means
 * not tested yet, so either can happen.
 */
export type AccountHandling = 'paused' | 'removed' | 'unknown'

export interface PhoneGuide {
    brand: string
    name: string
    /** Enrollment has been done end to end on this brand. */
    tested: boolean
    accounts: AccountHandling
    developerOptions: string[]
    notes: string[]
    /** Real screenshots of these steps, only where taken on that kind of phone (public/guide-img). */
    pictures?: GuidePicture[]
}

export interface GuidePicture {
    src: string
    /** What the picture shows, for screen readers and if it doesn't load. */
    alt: string
    caption: string
}

/** Android's own Settings (Android 14 emulator, 2026-11-09): what a Pixel shows. */
const STOCK_PICTURES: GuidePicture[] = [
    { src: '/guide-img/stock-1-build-number.png', alt: t('enroll.picture.build.alt'), caption: t('enroll.picture.build.caption') },
    { src: '/guide-img/stock-2-wireless-debugging.png', alt: t('enroll.picture.wireless.alt'), caption: t('enroll.picture.wireless.caption') },
    { src: '/guide-img/stock-3-allow.png', alt: t('enroll.picture.allow.alt'), caption: t('enroll.picture.allow.caption') },
    { src: '/guide-img/stock-4-pair.png', alt: t('enroll.picture.pair.alt'), caption: t('enroll.picture.pair.caption') },
]

/** Menu names vary by phone model and Android version; every guide ends with the Settings search fallback. */
const SEARCH_TIP = t('enroll.searchTip')

export const PHONE_GUIDES: PhoneGuide[] = [
    {
        brand: 'samsung',
        name: 'Samsung',
        tested: true,
        // SM-A045F, Android 14: refused device owner with every account's app paused (ADR-0006).
        accounts: 'removed',
        developerOptions: [
            t('enroll.step.samsungAbout'),
            t('enroll.step.buildPin'),
            t('enroll.step.samsungDev'),
            SEARCH_TIP,
        ],
        notes: [
            t('enroll.note.samsungPassword'),
            t('enroll.note.secureFolder'),
        ],
    },
    {
        brand: 'google',
        name: 'Google Pixel',
        tested: false,
        // Stock Android: pausing was enough on the emulator; not yet seen on a Pixel.
        accounts: 'paused',
        developerOptions: [
            t('enroll.step.aboutPhone'),
            t('enroll.step.buildPin'),
            t('enroll.step.systemDev'),
            SEARCH_TIP,
        ],
        notes: [],
        pictures: STOCK_PICTURES,
    },
    {
        brand: 'xiaomi',
        name: t('enroll.brand.xiaomi'),
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            t('enroll.step.aboutPhone'),
            t('enroll.step.xiaomiVersion'),
            t('enroll.step.additionalDev'),
            t('enroll.step.xiaomiUsb'),
            SEARCH_TIP,
        ],
        notes: [t('enroll.note.xiaomiAccount')],
    },
    {
        brand: 'oppo-realme',
        name: t('enroll.brand.oppo'),
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            t('enroll.step.aboutVersion'),
            t('enroll.step.build'),
            t('enroll.step.additionalDev'),
            SEARCH_TIP,
        ],
        notes: [],
    },
    {
        brand: 'oneplus',
        name: 'OnePlus',
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            t('enroll.step.aboutVersion'),
            t('enroll.step.build'),
            t('enroll.step.systemDev'),
            SEARCH_TIP,
        ],
        notes: [],
    },
    {
        brand: 'motorola',
        name: 'Motorola',
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            t('enroll.step.aboutPhone'),
            t('enroll.step.build'),
            t('enroll.step.systemDev'),
            SEARCH_TIP,
        ],
        notes: [],
    },
    {
        brand: 'other',
        name: t('enroll.brand.other'),
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            t('enroll.step.otherAbout'),
            t('enroll.step.build'),
            t('enroll.step.otherDev'),
            SEARCH_TIP,
        ],
        notes: [],
    },
]

/** The guide for the maker the phone itself reported when it connected (`Build.MANUFACTURER`). */
export function brandFromManufacturer(manufacturer: string | undefined): string {
    const maker = (manufacturer ?? '').trim().toLowerCase()
    if (maker === 'samsung') return 'samsung'
    if (maker === 'google') return 'google'
    if (['xiaomi', 'redmi', 'poco'].includes(maker)) return 'xiaomi'
    if (['oppo', 'realme'].includes(maker)) return 'oppo-realme'
    if (maker === 'oneplus') return 'oneplus'
    if (maker === 'motorola') return 'motorola'
    return 'other'
}

export function guideFor(brand: string): PhoneGuide | undefined {
    return PHONE_GUIDES.find((guide) => guide.brand === brand)
}

/** Said before anything is changed on the phone, so no parent finds out halfway through. */
export function accountsText(guide: PhoneGuide): string {
    switch (guide.accounts) {
        case 'paused':
            return `${t('enroll.accounts.paused')} ${guide.tested ? '' : t('enroll.accounts.pausedUntested')}`.trim()
        case 'removed':
            return t('enroll.accounts.removed', { brand: guide.name })
        case 'unknown':
            return t('enroll.accounts.unknown')
    }
}

/** The parent confirms they can get back in to Google before turning anything on, unless nothing will be removed. */
export function needsGoogleCheck(guide: PhoneGuide): boolean {
    return guide.accounts !== 'paused'
}

/**
 * The easiest path of all, for a new phone or one being reset anyway: with no account on it, setup
 * removes nothing (SetupFlow: a phone with no accounts goes straight to device owner).
 */
export const NO_ACCOUNTS_YET =
    t('enroll.noAccountsYet')


export type PrepareKey = 'charged' | 'chatsBackedUp' | 'passwordsNoted' | 'wifiReady' | 'debuggingOn'

export const PREPARE_ITEMS: { key: PrepareKey; text: string }[] = [
    { key: 'charged', text: t('enroll.prepare.charged') },
    {
        key: 'chatsBackedUp',
        text: t('enroll.prepare.chats'),
    },
    {
        key: 'passwordsNoted',
        text: t('enroll.prepare.passwords'),
    },
    { key: 'wifiReady', text: t('enroll.prepare.wifi') },
    { key: 'debuggingOn', text: t('enroll.prepare.debugging') },
]

export type Prepared = Record<PrepareKey, boolean>

export function nothingPrepared(): Prepared {
    return { charged: false, chatsBackedUp: false, passwordsNoted: false, wifiReady: false, debuggingOn: false }
}

export function preparedComplete(prepared: Prepared): boolean {
    return PREPARE_ITEMS.every(({ key }) => prepared[key])
}
