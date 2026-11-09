package com.manara.agent.provision

/**
 * Setup by QR code on a new or factory-reset phone (Android Enterprise, Android 7+): the parent taps
 * the welcome screen six times, scans the console's QR code, and Android itself shows that the phone
 * will be managed, downloads Manara, and makes it device owner. No Developer options, no wireless
 * debugging, no account to remove: a phone fresh from a reset has none.
 *
 * Since Android 12 the app must answer two activities (DevicePolicyManager reference, deprecation
 * note of ACTION_PROVISION_MANAGED_DEVICE): GET_PROVISIONING_MODE, then ADMIN_POLICY_COMPLIANCE,
 * which receives the QR code's extras bundle (EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE), as Google's
 * TestDPC sample does. The parent's connection code travels in that bundle. Pure; the activities
 * are thin wrappers.
 */
object QrProvisioning {

    /** Key of the connection code in the QR code's admin extras bundle; the console writes the same. */
    const val TOKEN_KEY = "com.manara.agent.ENROLLMENT_TOKEN"

    /**
     * Manara only manages whole phones. [allowed] is what Android offers
     * (EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES); absent or empty means it didn't say, as
     * TestDPC treats it.
     */
    fun acceptsFullyManaged(allowed: List<Int>?, fullyManaged: Int): Boolean =
        allowed.isNullOrEmpty() || fullyManaged in allowed

    /** The connection code from the extras bundle, or null if it's missing or not one Manara issues. */
    fun tokenFrom(value: Any?): String? {
        val token = (value as? String)?.trim() ?: return null
        return token.takeIf { it.length in 8..200 && it.all { c -> c.isLetterOrDigit() || c in "-_." } }
    }
}
