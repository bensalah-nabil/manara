package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface PolicyDao {
    @Upsert
    suspend fun replace(entity: PolicyEntity)

    @Query("SELECT * FROM policy WHERE id = :id LIMIT 1")
    suspend fun get(id: String = PolicyEntity.CURRENT): PolicyEntity?

    @Query("SELECT * FROM policy WHERE id = :id LIMIT 1")
    fun observe(id: String = PolicyEntity.CURRENT): Flow<PolicyEntity?>

    @Query("SELECT version FROM policy WHERE id = :id LIMIT 1")
    suspend fun currentVersion(id: String = PolicyEntity.CURRENT): Int?

    @Query("DELETE FROM policy")
    suspend fun clear()
}
