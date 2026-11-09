/** Must equal domain.AttestationVersion on the server; a mismatch makes the server reject the code request. */
export const ATTESTATION_VERSION = '2026-11-06'

export type StatementKey = 'parentOrGuardian' | 'minorChild' | 'childInformed'

export const STATEMENTS: { key: StatementKey; text: string }[] = [
    { key: 'parentOrGuardian', text: "I am this child's parent or legal guardian." },
    { key: 'minorChild', text: 'This phone is used by my child, who is a minor where we live.' },
    {
        key: 'childInformed',
        text: 'My child will be told that this phone is managed. The phone always shows a notice saying so, and Manara cannot hide it.',
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
    { src: '/guide-img/stock-1-build-number.png', alt: 'About phone, with Build number outlined at the bottom', caption: 'Tap Build number seven times.' },
    { src: '/guide-img/stock-2-wireless-debugging.png', alt: 'Developer options, with Wireless debugging outlined under Debugging', caption: 'In Developer options, open Wireless debugging and turn it on.' },
    { src: '/guide-img/stock-3-allow.png', alt: 'The prompt Allow wireless debugging on this network, with Allow outlined', caption: 'Android asks first: tap Allow. Manara turns wireless debugging off again at the end.' },
    { src: '/guide-img/stock-4-pair.png', alt: 'Wireless debugging turned on, with Pair device with QR code and Pair device with pairing code outlined', caption: 'Stay on this screen. Later, the console tells you which of these two to tap.' },
]

/** Menu names vary by phone model and Android version; every guide ends with the Settings search fallback. */
const SEARCH_TIP = 'If a menu name differs on this phone, use the search box at the top of Settings: search "Build number", then "Wireless debugging".'

export const PHONE_GUIDES: PhoneGuide[] = [
    {
        brand: 'samsung',
        name: 'Samsung',
        tested: true,
        // SM-A045F, Android 14: refused device owner with every account's app paused (ADR-0006).
        accounts: 'removed',
        developerOptions: [
            'Open Settings, then About phone, then Software information.',
            'Tap "Build number" seven times, then enter the phone\'s PIN when asked.',
            'Go back to Settings. Open Developer options at the bottom and turn on "Wireless debugging".',
            SEARCH_TIP,
        ],
        notes: [
            'Removing the Samsung account asks for its password, so have it ready.',
            'If the phone has a Secure Folder, it must be removed first. Anything stored inside it is deleted, so move what you need out of it.',
        ],
    },
    {
        brand: 'google',
        name: 'Google Pixel',
        tested: false,
        // Stock Android: pausing was enough on the emulator; not yet seen on a Pixel.
        accounts: 'paused',
        developerOptions: [
            'Open Settings, then About phone.',
            'Tap "Build number" seven times, then enter the phone\'s PIN when asked.',
            'Open Settings, then System, then Developer options, and turn on "Wireless debugging".',
            SEARCH_TIP,
        ],
        notes: [],
        pictures: STOCK_PICTURES,
    },
    {
        brand: 'xiaomi',
        name: 'Xiaomi, Redmi or POCO',
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            'Open Settings, then About phone.',
            'Tap "OS version" (or "MIUI version") seven times.',
            'Open Settings, then Additional settings, then Developer options, and turn on "Wireless debugging".',
            'Also turn on "Install via USB" and "USB debugging (Security settings)". These need a signed-in Xiaomi account and may need a SIM card.',
            SEARCH_TIP,
        ],
        notes: ['The Xiaomi account still has to be removed later, before the phone can be connected to Manara.'],
    },
    {
        brand: 'oppo-realme',
        name: 'Oppo or Realme',
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            'Open Settings, then About device, then Version.',
            'Tap "Build number" seven times.',
            'Open Settings, then Additional settings, then Developer options, and turn on "Wireless debugging".',
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
            'Open Settings, then About device, then Version.',
            'Tap "Build number" seven times.',
            'Open Settings, then System, then Developer options, and turn on "Wireless debugging".',
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
            'Open Settings, then About phone.',
            'Tap "Build number" seven times.',
            'Open Settings, then System, then Developer options, and turn on "Wireless debugging".',
            SEARCH_TIP,
        ],
        notes: [],
    },
    {
        brand: 'other',
        name: 'Another brand',
        tested: false,
        accounts: 'unknown',
        developerOptions: [
            'Open Settings and find "About phone" (sometimes under "System" or "Software information").',
            'Tap "Build number" seven times.',
            'Find "Developer options" (often under "System" or "Additional settings") and turn on "Wireless debugging".',
            SEARCH_TIP,
        ],
        notes: [],
    },
]

export function guideFor(brand: string): PhoneGuide | undefined {
    return PHONE_GUIDES.find((guide) => guide.brand === brand)
}

/** Said before anything is changed on the phone, so no parent finds out halfway through. */
export function accountsText(guide: PhoneGuide): string {
    switch (guide.accounts) {
        case 'paused':
            return `On this phone, setup should only pause the apps that hold an account for a few seconds: no account is removed and nothing needs signing back in. ${guide.tested ? '' : 'This has not been tested on this brand yet, so be ready in case it does.'}`.trim()
        case 'removed':
            return `On ${guide.name} phones, every account (Google and the others) has to be removed for a moment during setup, then signed back in at the end. No app is uninstalled and no app data is lost, but you will need to get back in to the Google account.`
        case 'unknown':
            return 'On some phones every account has to be removed for a moment during setup, then signed back in at the end. Manara has not been tested on this brand, so be ready for it. No app is uninstalled and no app data is lost.'
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
    "A new phone, or one you are resetting anyway? Set it up without signing in to Google (choose Skip), install Manara and finish guided setup first, then sign in. Nothing has to be removed. This works when Manara is installed from a file or link, not from the Play Store, which needs a Google account."


export type PrepareKey = 'charged' | 'chatsBackedUp' | 'passwordsNoted' | 'wifiReady' | 'debuggingOn'

export const PREPARE_ITEMS: { key: PrepareKey; text: string }[] = [
    { key: 'charged', text: 'The phone is charged above 50% and can stay plugged in.' },
    {
        key: 'chatsBackedUp',
        text: 'As a precaution, WhatsApp and other chat apps are backed up (for WhatsApp: Settings, Chats, Chat backup). Setup does not uninstall any app or delete app data.',
    },
    {
        key: 'passwordsNoted',
        text: "I can get back in to the phone's accounts if setup needs them removed for a moment: for Google, a passkey on my phone, a code by SMS, or the password. Manara never sees or stores passwords.",
    },
    { key: 'wifiReady', text: 'The phone runs Android 11 or newer and is connected to Wi-Fi. No computer or cable is needed.' },
    { key: 'debuggingOn', text: 'Wireless debugging is on, following the steps for this phone.' },
]

export type Prepared = Record<PrepareKey, boolean>

export function nothingPrepared(): Prepared {
    return { charged: false, chatsBackedUp: false, passwordsNoted: false, wifiReady: false, debuggingOn: false }
}

export function preparedComplete(prepared: Prepared): boolean {
    return PREPARE_ITEMS.every(({ key }) => prepared[key])
}
