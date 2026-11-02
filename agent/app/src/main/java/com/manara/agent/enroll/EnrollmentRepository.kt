package com.manara.agent.enroll

import android.os.Build
import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.policy.PolicyCache
import com.manara.agent.sync.DeviceInfo
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.EnrollRequest
import com.manara.agent.sync.ManaraApi

/**
 * Wraps the `/enroll` call: on success, persists the device token (see
 * `DeviceTokenStore`/`SecureTokenCipher`), caches the initial policy, and
 * applies it immediately — so a child's device starts enforcing without
 * waiting for the first scheduled sync.
 */
class EnrollmentRepository(
    private val api: ManaraApi,
    private val tokenStore: DeviceTokenStore,
    private val policyCache: PolicyCache,
    private val enforcerRegistry: EnforcerRegistry
) {
    sealed class Result {
        data object Success : Result()
        /** The token was wrong, already used, or the server rejected it for some other reason. */
        data class Rejected(val httpCode: Int) : Result()
        data class Failed(val cause: Throwable) : Result()
    }

    suspend fun enroll(enrollmentToken: String): Result {
        val token = enrollmentToken.trim()
        if (token.isEmpty()) return Result.Rejected(httpCode = 0)

        return try {
            val response = api.enroll(
                EnrollRequest(
                    enrollmentToken = token,
                    deviceInfo = DeviceInfo(
                        model = Build.MODEL,
                        manufacturer = Build.MANUFACTURER,
                        androidVersion = Build.VERSION.RELEASE
                    )
                )
            )
            val body = response.body()
            if (!response.isSuccessful || body == null) {
                return Result.Rejected(response.code())
            }

            tokenStore.save(body.deviceId, body.deviceToken)
            policyCache.replace(body.policy)
            enforcerRegistry.applyAll(body.policy)
            Result.Success
        } catch (t: Exception) {
            Result.Failed(t)
        }
    }
}
