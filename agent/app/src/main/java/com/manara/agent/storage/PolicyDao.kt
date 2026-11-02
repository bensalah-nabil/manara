package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface PolicyDao {
    @Upsert
    suspend fun replace(entity: PolicyEntity)

    @Query("SELECT * FROM policy WHERE id = :id LIMIT 1")
    suspend fun get(id: String = PolicyEntity.CURRENT): PolicyEntity?

    @Query("SELECT version FROM policy WHERE id = :id LIMIT 1")
    suspend fun currentVersion(id: String = PolicyEntity.CURRENT): Int?
}
