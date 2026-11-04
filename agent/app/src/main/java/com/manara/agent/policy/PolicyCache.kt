package com.manara.agent.policy

import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.storage.PolicyEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

/**
 * The agent's one source of truth for "what policy am I currently
 * enforcing" (architecture.md §2.1). Enforcers read from here, never from
 * the network directly — a policy update from sync is just a call to
 * [replace].
 */
class PolicyCache(private val db: ManaraDatabase) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun current(): Policy? =
        db.policyDao().get()?.let { json.decodeFromString(Policy.serializer(), it.json) }

    suspend fun currentVersion(): Int? = db.policyDao().currentVersion()

    fun observe(): Flow<Policy?> = db.policyDao().observe().map { stored ->
        stored?.let { json.decodeFromString(Policy.serializer(), it.json) }
    }

    suspend fun replace(policy: Policy) {
        db.policyDao().replace(
            PolicyEntity(
                version = policy.version,
                json = json.encodeToString(Policy.serializer(), policy)
            )
        )
    }
}
