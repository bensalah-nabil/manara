package com.manara.agent.storage

import androidx.room.Entity

@Entity(tableName = "health_states", primaryKeys = ["enforcerId", "check"])
data class HealthStateEntity(
    val enforcerId: String,
    val check: String,
    val healthy: Boolean?
)
