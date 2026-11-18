package com.manara.agent.update

import kotlinx.serialization.Serializable

/**
 * The directly downloaded Manara version the server says phones should run (`agentUpdate` in the
 * sync response, api-spec/openapi.yaml). The server leaves it out while updates are held back.
 */
@Serializable
data class UpdateOffer(
    val versionCode: Int,
    val versionName: String,
    val url: String,
    val sha256: String,
)

/**
 * Pure. Whether this phone should fetch and install an offered update, and whether a downloaded
 * file is the one offered. [UpdateInstaller] (direct build only) does the Android side.
 *
 * Installing needs no prompt because Manara is device owner: AOSP android14-release and
 * android15-release, `PackageInstallerSession.computeUserActionRequirement` returns before any
 * permission or update-owner check when `isInstallerDeviceOwnerOrAffiliatedProfileOwner()`, which
 * `DevicePolicyManagerService.canSilentlyInstallPackage` grants the device owner on the system user.
 * Android itself refuses an update signed with another key, and a lower version code.
 */
object UpdateDecision {
    /** Only files from Manara's own GitHub releases (docs/play-store.md, "Publish the direct APK"). */
    const val RELEASES_URL = "https://github.com/bensalah-nabil/manara/releases/download/"

    /** Tries per version before giving up on it until a newer one is offered. */
    const val MAX_TRIES = 3

    private val sha256Pattern = Regex("^[0-9a-f]{64}$")

    /** Why not to update now, or null to go ahead. */
    fun reasonToWait(
        offer: UpdateOffer?,
        installedVersionCode: Int,
        selfUpdateBuild: Boolean,
        deviceOwner: Boolean,
        setupRunning: Boolean,
        releasing: Boolean,
        failedTries: Int,
    ): String? = when {
        !selfUpdateBuild -> "this build updates through Google Play"
        offer == null -> "no update offered"
        offer.versionCode <= installedVersionCode -> "already up to date"
        !offer.url.startsWith(RELEASES_URL) -> "offered file is not a Manara release"
        !sha256Pattern.matches(offer.sha256) -> "offered checksum is malformed"
        // Without device owner Android would ask the child to confirm: never prompt them.
        !deviceOwner -> "not device owner"
        // An update kills the process: never in the middle of guided setup or a release.
        setupRunning -> "guided setup is running"
        releasing -> "the phone is being released"
        failedTries >= MAX_TRIES -> "gave up on ${offer.versionName} after $failedTries tries"
        else -> null
    }

    /** What is wrong with a downloaded file, or null when it is exactly the offered update. */
    fun problemWithDownload(
        offer: UpdateOffer,
        fileSha256: String,
        filePackageName: String?,
        fileVersionCode: Long?,
        ownPackageName: String,
    ): String? = when {
        fileSha256 != offer.sha256 -> "checksum does not match"
        filePackageName != ownPackageName -> "file is not Manara"
        fileVersionCode != offer.versionCode.toLong() -> "file is version $fileVersionCode, not ${offer.versionCode}"
        else -> null
    }
}
