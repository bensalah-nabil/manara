package com.manara.agent.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface LocationObservationDao {
    @Query("SELECT * FROM location_observation WHERE id = 1")
    suspend fun get(): LocationObservationEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(observation: LocationObservationEntity)

    @Query("DELETE FROM location_observation")
    suspend fun clear()
}
