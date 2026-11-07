package com.manara.agent.policy

import android.content.Context
import android.util.Log
import com.manara.agent.enforcers.DailyUsageReader
import com.manara.agent.enforcers.LocationEnforcer
import com.manara.agent.storage.ManaraDatabase
import kotlinx.coroutines.CancellationException

internal class CollectionStatusReader(private val context: Context, private val db: ManaraDatabase) {
    data class Snapshot(
        val usageMinutes: Map<String, Long>?,
        val usage: CollectionStatusSummary.Usage,
        val location: CollectionStatusSummary.LocationStatus
    )

    suspend fun read(policy: Policy?): Snapshot {
        val usageReader = DailyUsageReader(context)
        val usageNeeded = CollectionStatusSummary.usageDataNeeded(policy)
        val minutes = if (usageNeeded) attempt("usage data") { usageReader.readMinutes() } else null
        val usage = when {
            minutes != null -> CollectionStatusSummary.Usage.READABLE
            usageNeeded && attempt("Usage Access") { usageReader.hasAccess() } == false ->
                CollectionStatusSummary.Usage.ACCESS_MISSING
            else -> CollectionStatusSummary.Usage.UNAVAILABLE
        }
        val location = if (policy?.location?.enabled == true) readLocation() else CollectionStatusSummary.LocationStatus()
        return Snapshot(minutes, usage, location)
    }

    private suspend fun readLocation(): CollectionStatusSummary.LocationStatus {
        val toggle = attempt("location setting") { LocationEnforcer.isLocationOn(context) }
        val permission = attempt("location permission") { com.manara.agent.location.LocationSharing.hasPermissions(context) }
        val history = attempt("saved location history") {
            val saved = db.locationObservationDao().get()
            CollectionStatusSummary.LocationStatus(historyKnown = true, lastSample = saved?.let {
                CollectionStatusSummary.SavedSample(it.sampleAt, it.savedAt)
            })
        } ?: CollectionStatusSummary.LocationStatus()
        return history.copy(toggleOn = toggle, permissionGranted = permission)
    }

    private suspend fun <Value> attempt(label: String, read: suspend () -> Value): Value? = try {
        read()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Log.w("ManaraCollectionStatus", "Cannot read $label", error)
        null
    }
}
