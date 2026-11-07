package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface HealthStateDao {
    @Query("SELECT * FROM health_states WHERE enforcerId = :enforcerId AND `check` = :check")
    suspend fun get(enforcerId: String, check: String): HealthStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(state: HealthStateEntity)

    /** Unknown, not deleted: a deleted row would fall back to the legacy SharedPreferences value. */
    @Query("UPDATE health_states SET healthy = NULL")
    suspend fun forgetAll()
}
