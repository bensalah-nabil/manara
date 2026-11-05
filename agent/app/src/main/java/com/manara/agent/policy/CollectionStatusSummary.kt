package com.manara.agent.policy

import java.time.Instant

object CollectionStatusSummary {
    fun needsRefresh(policy: Policy?): Boolean = policy?.let {
        it.location.enabled || usageDataNeeded(it)
    } == true

    /** Usage data is read for app time limits that name apps, and for the opt-in usage report. */
    fun usageDataNeeded(policy: Policy?): Boolean = policy != null &&
        (policy.usageReport.enabled || (policy.timeLimits.enabled && policy.timeLimits.rules.any { it.packages.isNotEmpty() }))

    enum class Usage { READABLE, ACCESS_MISSING, UNAVAILABLE }

    data class SavedSample(val sampleAt: Long?, val savedAt: Long)

    data class LocationStatus(
        val toggleOn: Boolean? = null,
        val permissionGranted: Boolean? = null,
        val historyKnown: Boolean = false,
        val lastSample: SavedSample? = null
    )

    fun describe(
        policy: Policy?,
        usage: Usage = Usage.UNAVAILABLE,
        location: LocationStatus = LocationStatus(),
        now: Long = System.currentTimeMillis()
    ): String {
        val lines = mutableListOf<String>()
        lines += when {
            policy == null -> "Usage data: unknown (no policy)"
            !usageDataNeeded(policy) ->
                "Usage data: inactive"
            usage == Usage.READABLE -> "Usage data: readable"
            usage == Usage.ACCESS_MISSING -> "Usage data: unavailable (Usage Access missing)"
            else -> "Usage data: unavailable"
        }
        lines += when {
            policy == null -> "Location: unknown (no policy)"
            !policy.location.enabled -> "Location: off by policy"
            location.toggleOn == false -> "Location: device setting off"
            location.permissionGranted == false -> "Location: permission missing"
            location.toggleOn == null || location.permissionGranted == null -> "Location: prerequisites unknown"
            else -> "Location: prerequisites available"
        }
        if (policy?.location?.enabled == true) {
            val sample = location.lastSample
            if (!location.historyKnown) {
                lines += "Saved location history: unavailable"
            } else if (sample == null) {
                lines += "No saved location sample recorded locally"
            } else {
                lines += "Historical location sample"
                lines += "Saved locally: ${timestamp(sample.savedAt, now)}"
                lines += "Sample time: ${timestamp(sample.sampleAt, now)}"
            }
        }
        lines += "Call logs: unsupported"
        return lines.joinToString("\n")
    }

    private fun timestamp(value: Long?, now: Long): String = when {
        value == null || value <= 0L -> "unknown"
        value > now -> "unknown (clock inconsistency)"
        else -> Instant.ofEpochMilli(value).toString()
    }
}
