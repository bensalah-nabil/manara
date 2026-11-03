package com.manara.agent.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One row per command the agent has executed (or given up on) but not yet
 * reported back via `/agent/sync`'s `commandAcks` -- same durability
 * reasoning as [EventEntity]: a dropped sync response must not lose the
 * fact that `lock_now` already ran, since re-sending the same ack is a
 * safe no-op but silently forgetting it isn't.
 */
@Entity(tableName = "command_acks")
data class CommandAckEntity(
    @PrimaryKey val commandId: String,
    val status: String,
    val detail: String?,
    val enqueuedAt: Long
)
