package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CommandAckDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: CommandAckEntity)

    @Query("SELECT * FROM command_acks ORDER BY enqueuedAt ASC")
    suspend fun all(): List<CommandAckEntity>

    @Query("DELETE FROM command_acks WHERE commandId IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}
