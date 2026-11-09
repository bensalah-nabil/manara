package com.manara.agent.enroll

import android.os.Build
import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.policy.PolicyCache
import com.manara.agent.sync.DeviceInfo
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.EnrollRequest
import com.manara.agent.release.EnrollmentGate
import com.manara.agent.release.ReleaseStore
import com.manara.agent.release.TransferWindow
import com.manara.agent.sync.CommandAck
import com.manara.agent.sync.ManaraApi
import com.manara.agent.sync.SyncRequest

/**
 * Wraps the `/enroll` call: on success, persists the device token (see
 * `DeviceTokenStore`/`SecureTokenCipher`), caches the initial policy, and
 * applies it immediately — so a child's device starts enforcing without
 * waiting for the first scheduled sync.
 *
 * An enrolled phone takes a new code only while its parent has opened a move
 * ([EnrollmentGate]); otherwise it refuses without using up the code. On a
 * move, once the new server has accepted the phone (not before, so a failed
 * attempt loses nothing), the old account is told the phone has left, and
 * [previousAccountData] is discarded before the new token is saved.
 */
class EnrollmentRepository(
    private val api: ManaraApi,
    private val tokenStore: DeviceTokenStore,
    private val policyCache: PolicyCache,
    private val enforcerRegistry: EnforcerRegistry,
    private val previousAccountData: PreviousAccountData,
    private val releaseStore: ReleaseStore,
    private val now: () -> Long = System::currentTimeMillis
) {
    sealed class Result {
        data object Success : Result()
        /** The token was wrong, already used, or the server rejected it for some other reason. */
        data class Rejected(val httpCode: Int) : Result()
        data class Failed(val cause: Throwable) : Result()
        /** Already managed for a parent who hasn't opened a move: only that parent can release it. */
        data object NotAllowed : Result()
    }

    fun decision(): EnrollmentGate.Decision = EnrollmentGate.decide(
        enrolled = tokenStore.deviceId() != null,
        transferOpen = TransferWindow.isOpen(releaseStore.transferUntil, now())
    )

    suspend fun enroll(enrollmentToken: String): Result {
        val token = enrollmentToken.trim()
        if (token.isEmpty()) return Result.Rejected(httpCode = 0)
        val decision = decision()
        if (decision == EnrollmentGate.Decision.REFUSE) return Result.NotAllowed

        return try {
            val response = api.enroll(
                EnrollRequest(
                    enrollmentToken = token,
                    deviceInfo = DeviceInfo(
                        model = Build.MODEL,
                        manufacturer = Build.MANUFACTURER,
                        androidVersion = Build.VERSION.RELEASE,
                        agentVersion = com.manara.agent.BuildConfig.VERSION_NAME
                    )
                )
            )
            val body = response.body()
            if (!response.isSuccessful || body == null) {
                return Result.Rejected(response.code())
            }

            if (decision == EnrollmentGate.Decision.MOVE) {
                leavePreviousAccount()
                previousAccountData.discard()
            }
            tokenStore.clear()
            tokenStore.save(body.deviceId, body.deviceToken)
            body.releaseSecret?.let { tokenStore.saveReleaseSecret(it) }
            releaseStore.closeTransfer()
            policyCache.replace(body.policy)
            enforcerRegistry.applyAll(body.policy)
            Result.Success
        } catch (t: Exception) {
            Result.Failed(t)
        }
    }

    /**
     * Best effort: acking the move's release command makes the old account
     * delete the phone. If this doesn't arrive, that parent sees it stop
     * reporting and can remove it from the console.
     */
    private suspend fun leavePreviousAccount() {
        val oldToken = tokenStore.deviceToken() ?: return
        val commandId = releaseStore.transferCommandId ?: return
        runCatching {
            api.sync(
                bearerToken = "Bearer $oldToken",
                request = SyncRequest(
                    policyVersion = policyCache.currentVersion() ?: 0,
                    events = emptyList(),
                    commandAcks = listOf(CommandAck(commandId, "acked", null)),
                    hasReleaseSecret = true
                )
            )
        }.onFailure { android.util.Log.w("ManaraEnroll", "Could not tell the previous account the phone left", it) }
    }
}
