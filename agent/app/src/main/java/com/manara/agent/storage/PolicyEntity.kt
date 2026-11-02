package com.manara.agent.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Single-row table — architecture.md §2.1: "a policy update is just a
 * cache replacement," so there is exactly one current policy, never a
 * history of them. `id` is always [CURRENT]; replacing uses upsert, so a
 * new policy overwrites the old one rather than accumulating rows.
 */
@Entity(tableName = "policy")
data class PolicyEntity(
    @PrimaryKey val id: String = CURRENT,
    val version: Int,
    val json: String
) {
    companion object {
        const val CURRENT = "current"
    }
}
