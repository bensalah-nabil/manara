package com.manara.agent.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "location_observation")
data class LocationObservationEntity(
    @PrimaryKey val id: Int = 1,
    val eventId: String,
    val sampleAt: Long?,
    val savedAt: Long
)