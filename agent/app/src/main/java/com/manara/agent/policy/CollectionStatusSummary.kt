package com.manara.agent.policy

object CollectionStatusSummary {
    /** Usage data is read for app time limits that name apps, and for the opt-in usage report. */
    fun usageDataNeeded(policy: Policy?): Boolean = policy != null &&
        (policy.usageReport.enabled || (policy.timeLimits.enabled && policy.timeLimits.rules.any { it.packages.isNotEmpty() || it.allGames }))

    enum class Usage { READABLE, ACCESS_MISSING, UNAVAILABLE }

    data class SavedSample(val sampleAt: Long?, val savedAt: Long)

    data class LocationStatus(
        val toggleOn: Boolean? = null,
        val permissionGranted: Boolean? = null,
        val historyKnown: Boolean = false,
        val lastSample: SavedSample? = null
    )
}
