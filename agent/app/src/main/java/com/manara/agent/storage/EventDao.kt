package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: EventEntity)

    @Query("SELECT * FROM events ORDER BY enqueuedAt ASC LIMIT :limit")
    suspend fun oldest(limit: Int): List<EventEntity>

    @Query("DELETE FROM events WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("SELECT COUNT(*) FROM events")
    suspend fun count(): Int

    @Query("DELETE FROM events")
    suspend fun deleteAll()
}
