package com.manara.agent.sync

import com.manara.agent.enforcers.EnforcerRegistry
import com.manara.agent.enforcers.LockEnforcer
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.PolicyCache
import com.manara.agent.release.Releaser
import com.manara.agent.release.ReleaseStore
import com.manara.agent.release.TransferWindow
import kotlinx.serialization.json.jsonPrimitive

/**
 * The one round-trip of the agent-sync loop (architecture.md §3,
 * `api-spec/openapi.yaml`'s `/agent/sync`): drains the event queue,
 * reports the policy version currently cached, sends any push token and
 * command acks, and applies/executes whatever comes back. Knows nothing
 * about what an event *means* — that's [EnforcerRegistry]'s job.
 *
 * [pendingCommands] execution is the other half of `CommandType.IsUrgent()`
 * on the backend (the push-wake-up only matters if the sync it triggers
 * actually does something): found while wiring FCM push that a received
 * `lock_now` command was parsed into [SyncResponse.pendingCommands] but
 * never executed or acked anywhere — `LockEnforcer.lockImmediately()`
 * already existed for exactly this, just never called.
 *
 * Same discovery turned up a second, separate gap: [EnforcerRegistry.collectAllEvents]
 * was defined and called nowhere — an enforcer's own events (a scheduled
 * lock, a time-limit suspension) sat in its in-memory list forever,
 * never reaching [eventQueue] and so never the backend. Collected at two
 * points below: before draining (picks up whatever accumulated between
 * syncs, e.g. `SyncWorker`'s periodic re-apply entering a lock window)
 * and after executing pushed commands (picks up e.g. the lock event
 * `lockImmediately()` just generated, queued for the *next* sync same as
 * its ack — the same "ack/report on the following round" pattern already
 * used for command acks).
 */
class SyncManager(
    private val api: ManaraApi,
    private val policyCache: PolicyCache,
    private val eventQueue: EventQueue,
    private val enforcerRegistry: EnforcerRegistry,
    private val tokenStore: DeviceTokenStore,
    private val commandAckQueue: CommandAckQueue,
    private val pushTokenStore: PushTokenStore,
    private val releaser: Releaser,
    private val releaseStore: ReleaseStore,
    private val now: () -> Long = System::currentTimeMillis,
    private val onSuccess: (Long) -> Unit = {}
) {
    sealed class Result {
        data object Success : Result()
        data object NotEnrolled : Result()
        /** The device token was rejected — re-enrollment is needed, don't just retry. */
        data object Unauthorized : Result()
        /** The parent released the phone: Manara no longer manages it. */
        data object Released : Result()
        data class Failed(val cause: Throwable) : Result()
    }

    suspend fun sync(): Result {
        val token = tokenStore.deviceToken() ?: return Result.NotEnrolled

        collectEnforcerEvents()
        closeExpiredTransfer()

        val policyVersion = policyCache.currentVersion() ?: 0
        val events = eventQueue.drainBatch()
        val acksToSend = commandAckQueue.pending()

        return try {
            val response = api.sync(
                bearerToken = "Bearer $token",
                request = SyncRequest(
                    policyVersion = policyVersion,
                    events = events,
                    commandAcks = acksToSend,
                    pushToken = pushTokenStore.current(),
                    hasReleaseSecret = tokenStore.releaseSecret() != null,
                    agentVersion = com.manara.agent.BuildConfig.VERSION_NAME
                )
            )

            when {
                response.code() == 401 -> Result.Unauthorized
                !response.isSuccessful -> Result.Failed(IllegalStateException("sync failed: HTTP ${response.code()}"))
                else -> {
                    val body = response.body()
                        ?: return Result.Failed(IllegalStateException("empty sync response body"))

                    // Safe to drop locally once the backend confirms receipt
                    // (architecture.md §3.2) -- a dropped response here just
                    // means the same events/acks get re-sent next sync,
                    // harmless since the backend dedupes events by id and
                    // command acks are idempotent (re-acking is a no-op).
                    eventQueue.markAccepted(body.acceptedEventIds)
                    commandAckQueue.markSent(acksToSend.map { it.commandId })
                    body.releaseSecret?.let { tokenStore.saveReleaseSecret(it) }

                    if (body.policyChanged && body.policy != null) {
                        policyCache.replace(body.policy)
                        enforcerRegistry.applyAll(body.policy)
                    }

                    var removal: Command? = null
                    for (command in body.pendingCommands) {
                        if (command.type == "release") {
                            when (command.params["mode"]?.jsonPrimitive?.content) {
                                "remove" -> removal = command
                                "transfer" -> openTransfer(command)
                                else -> commandAckQueue.enqueue(CommandAck(command.commandId, "failed", "unknown release mode"))
                            }
                            continue
                        }
                        val (status, detail) = execute(command)
                        commandAckQueue.enqueue(CommandAck(command.commandId, status, detail))
                    }
                    collectEnforcerEvents()

                    onSuccess(now())
                    if (removal != null) removeManara(token, removal) else Result.Success
                }
            }
        } catch (t: Exception) {
            Result.Failed(t)
        }
    }

    /** A move stays open until the new account takes over (see EnrollmentRepository) or the window closes. */
    private fun openTransfer(command: Command) {
        if (releaseStore.transferCommandId == command.commandId) return
        releaser.openTransfer(command.commandId)
    }

    private suspend fun closeExpiredTransfer() {
        if (!TransferWindow.hasExpired(releaseStore.transferUntil, now())) return
        releaseStore.transferCommandId?.let {
            commandAckQueue.enqueue(CommandAck(it, "failed", "The phone was not connected to another account in time."))
        }
        releaseStore.closeTransfer()
    }

    /**
     * Tells the server first, while the token still works: its reply deletes
     * the phone from the account. The phone lets go whether or not that last
     * request arrives, since the parent asked for it; the console can still
     * remove a phone that never confirmed.
     */
    private suspend fun removeManara(token: String, command: Command): Result {
        commandAckQueue.enqueue(CommandAck(command.commandId, "acked", null))
        val acks = commandAckQueue.pending()
        val confirmed = runCatching {
            api.sync(
                bearerToken = "Bearer $token",
                request = SyncRequest(
                    policyVersion = policyCache.currentVersion() ?: 0,
                    events = emptyList(),
                    commandAcks = acks,
                    hasReleaseSecret = true
                )
            ).body()?.released == true
        }.getOrDefault(false)
        if (!confirmed) android.util.Log.w("ManaraSync", "Release ack not confirmed by the server; releasing anyway")
        releaser.removeManara()
        return Result.Released
    }

    companion object {
        /** The one place a SyncManager is wired, for the worker and the app's own screens. */
        fun create(context: android.content.Context, registry: EnforcerRegistry): SyncManager {
            val db = com.manara.agent.storage.ManaraDatabase.get(context)
            val tokenStore = DeviceTokenStore(context)
            val releaseStore = ReleaseStore(context)
            return SyncManager(
                api = ManaraApiFactory.create(),
                policyCache = PolicyCache(db),
                eventQueue = EventQueue(db),
                enforcerRegistry = registry,
                tokenStore = tokenStore,
                commandAckQueue = CommandAckQueue(db),
                pushTokenStore = PushTokenStore(context),
                releaser = Releaser(context, db, registry, tokenStore, releaseStore),
                releaseStore = releaseStore,
                onSuccess = SyncStatusStore(context)::recordSuccess
            )
        }
    }

    private suspend fun collectEnforcerEvents() {
        for (event in enforcerRegistry.collectAllEvents()) {
            eventQueue.enqueue(event)
        }
    }

    /**
     * Runs one pushed command now. `apply_policy`/`ping` need no action
     * beyond what already happened above (a changed policy is applied via
     * [EnforcerRegistry.applyAll] regardless of whether it arrived as a
     * policyChanged flag or an explicit command) -- acked here only so the
     * backend's command-queue lifecycle (architecture.md §3.1) always
     * resolves to acked|failed instead of sitting pending/delivered.
     *
     * `request_location` is acked but is **not actually a one-off fix
     * today** -- `LocationEnforcer`/`LocationSharing` only support a
     * running periodic service, no "get one fix right now" entry point
     * exists yet. Acking it as a no-op rather than "failed" because the
     * policy-level periodic location (when enabled) already covers the
     * same need on its own schedule; a true immediate-fix command is a
     * separate `LocationEnforcer` capability to add later, not implied by
     * this ack.
     */
    private fun execute(command: Command): Pair<String, String?> = when (command.type) {
        "lock_now" -> {
            val lockEnforcer = enforcerRegistry.find("lock") as? LockEnforcer
            when {
                lockEnforcer == null -> "failed" to "LockEnforcer not registered"
                else -> try {
                    lockEnforcer.lockImmediately()
                    "acked" to null
                } catch (e: Exception) {
                    "failed" to "lockNow() threw: ${e.message}"
                }
            }
        }
        "apply_policy", "ping", "request_location" -> "acked" to null
        else -> "failed" to "unknown command type: ${command.type}"
    }
}
