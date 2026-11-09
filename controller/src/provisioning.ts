/**
 * The QR code Android reads during setup of a new or factory-reset phone (Android Enterprise QR
 * provisioning, Android 7+: tap the welcome screen six times, then scan). Keys are the
 * DevicePolicyManager EXTRA_PROVISIONING_* names; the agent side is provision/QrProvisioning.kt.
 */

/** The device-owner component Android makes Manara. */
export const MANARA_ADMIN = 'com.manara.agent/.OwnerReceiver'

/**
 * SHA-256 of the certificate Manara's releases are signed with ("Manara upload key"), URL-safe
 * base64 without padding. Android refuses to install a downloaded APK whose signature doesn't match.
 */
export const MANARA_SIGNATURE = 'FJnkM_uJ-T2dD8cTnfH9Pht2U2wAo80ksp_7gcKDymE'

/**
 * Where Android downloads Manara during QR setup: the manara.apk asset of the latest GitHub release
 * (GitHub redirects this link to the file), so a new release needs no console change. Null hides
 * QR setup from the console altogether.
 */
export const MANARA_APK_URL: string | null = 'https://github.com/bensalah-nabil/manara/releases/latest/download/manara.apk'

/** Must equal QrProvisioning.TOKEN_KEY in the agent. */
export const TOKEN_KEY = 'com.manara.agent.ENROLLMENT_TOKEN'

export function qrSetupAvailable(apkUrl: string | null = MANARA_APK_URL): apkUrl is string {
    return !!apkUrl && apkUrl.startsWith('https://')
}

/** The QR code's text: everything Android needs to install Manara and hand it the connection code. */
export function provisioningQr(token: string, apkUrl: string): string {
    if (!qrSetupAvailable(apkUrl)) throw new Error('QR setup needs an HTTPS download of Manara')
    return JSON.stringify({
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': MANARA_ADMIN,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': MANARA_SIGNATURE,
        // A family phone keeps its camera, gallery and the rest: fully managed setup turns
        // preinstalled apps off unless asked not to.
        'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
        'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': { [TOKEN_KEY]: token },
    })
}

/** What the parent does, in order, once the QR code is on screen. */
export const QR_SETUP_STEPS: string[] = [
    'On the phone, reset it: open Settings and search "Factory data reset" (or "Erase all data"). This erases everything on it.',
    'When the phone shows its first welcome screen, tap the same spot on it six times. A QR code scanner opens.',
    'If the phone asks, connect it to Wi-Fi.',
    'Scan the QR code below. The phone explains that it will be managed and installs Manara by itself: follow its screens.',
    'When the phone has finished, sign in to Google on it if you want. Manara is already connected to your account.',
]
