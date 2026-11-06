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

export interface PhoneGuide {
    brand: string
    name: string
    /** Enrollment has been done end to end on this brand. */
    tested: boolean
    developerOptions: string[]
    notes: string[]
}

/** Menu names vary by phone model and Android version; every guide ends with the Settings search fallback. */
const SEARCH_TIP = 'If a menu name differs on this phone, use the search box at the top of Settings: search "Build number", then "Wireless debugging".'

export const PHONE_GUIDES: PhoneGuide[] = [
    {
        brand: 'samsung',
        name: 'Samsung',
        tested: true,
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
        developerOptions: [
            'Open Settings, then About phone.',
            'Tap "Build number" seven times, then enter the phone\'s PIN when asked.',
            'Open Settings, then System, then Developer options, and turn on "Wireless debugging".',
            SEARCH_TIP,
        ],
        notes: [],
    },
    {
        brand: 'xiaomi',
        name: 'Xiaomi, Redmi or POCO',
        tested: false,
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

export type PrepareKey = 'charged' | 'chatsBackedUp' | 'passwordsNoted' | 'wifiReady' | 'debuggingOn'

export const PREPARE_ITEMS: { key: PrepareKey; text: string }[] = [
    { key: 'charged', text: 'The phone is charged above 50% and can stay plugged in.' },
    {
        key: 'chatsBackedUp',
        text: 'WhatsApp and other chat apps are backed up (for WhatsApp: Settings, Chats, Chat backup). Apps that are removed during setup lose what is stored only on the phone.',
    },
    {
        key: 'passwordsNoted',
        text: 'I know the password of every account on the phone (Google, Samsung or Xiaomi, and each app) or have them written down safely. All accounts are removed during setup and must be signed back in afterwards. Manara never sees or stores passwords.',
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
