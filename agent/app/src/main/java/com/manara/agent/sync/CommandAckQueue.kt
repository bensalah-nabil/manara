package com.manara.agent.sync

import com.manara.agent.storage.CommandAckEntity
import com.manara.agent.storage.ManaraDatabase

/**
 * Durable queue for commands the agent has already executed (or given up
 * on) but not yet reported back via `/agent/sync`'s `commandAcks` --
 * mirrors [com.manara.agent.events.EventQueue]'s pattern for the same
 * reason: a command gets executed once `SyncManager` sees it in a sync
 * response, and that execution must survive a dropped response or a
 * process death before the ack is actually sent.
 */
class CommandAckQueue(private val db: ManaraDatabase) {

    suspend fun enqueue(ack: CommandAck) {
        db.commandAckDao().insert(
            CommandAckEntity(
                commandId = ack.commandId,
                status = ack.status,
                detail = ack.detail,
                enqueuedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun pending(): List<CommandAck> =
        db.commandAckDao().all().map { CommandAck(it.commandId, it.status, it.detail) }

    /** Call once the backend's sync response confirms these were sent successfully. */
    suspend fun markSent(ids: List<String>) {
        if (ids.isNotEmpty()) db.commandAckDao().deleteByIds(ids)
    }
}
