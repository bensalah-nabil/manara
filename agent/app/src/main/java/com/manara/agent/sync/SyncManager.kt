package com.manara.agent.sync

import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.PolicyCache

/**
 * The one round-trip of the agent-sync loop (architecture.md §3,
 * `api-spec/openapi.yaml`'s `/agent/sync`): drains the event queue,
 * reports the policy version currently cached, and applies whatever comes
 * back. Knows nothing about what an event *means* — that's
 * [EnforcerRegistry]'s job.
 *
 * `commandAcks` is always sent empty for now: Phase 1's scope ends before
 * any enforcer that actually executes a pushed command (`LockEnforcer`
 * etc.) exists, so there's nothing yet to ack.
 */
class SyncManager(
    private val api: ManaraApi,
    private val policyCache: PolicyCache,
    private val eventQueue: EventQueue,
    private val enforcerRegistry: EnforcerRegistry,
    private val tokenStore: DeviceTokenStore
) {
    sealed class Result {
        data object Success : Result()
        data object NotEnrolled : Result()
        /** The device token was rejected — re-enrollment is needed, don't just retry. */
        data object Unauthorized : Result()
        data class Failed(val cause: Throwable) : Result()
    }

    suspend fun sync(): Result {
        val token = tokenStore.deviceToken() ?: return Result.NotEnrolled
        val policyVersion = policyCache.currentVersion() ?: 0
        val events = eventQueue.drainBatch()

        return try {
            val response = api.sync(
                bearerToken = "Bearer $token",
                request = SyncRequest(policyVersion = policyVersion, events = events, commandAcks = emptyList())
            )

            when {
                response.code() == 401 -> Result.Unauthorized
                !response.isSuccessful -> Result.Failed(IllegalStateException("sync failed: HTTP ${response.code()}"))
                else -> {
                    val body = response.body()
                        ?: return Result.Failed(IllegalStateException("empty sync response body"))

                    // Safe to drop locally once the backend confirms receipt
                    // (architecture.md §3.2) -- a dropped response here just
                    // means the same events get re-sent next sync, harmless
                    // since the backend dedupes on id.
                    eventQueue.markAccepted(body.acceptedEventIds)

                    if (body.policyChanged && body.policy != null) {
                        policyCache.replace(body.policy)
                        enforcerRegistry.applyAll(body.policy)
                    }
                    Result.Success
                }
            }
        } catch (t: Exception) {
            Result.Failed(t)
        }
    }
}
