package com.manara.agent.enforcers

/**
 * Pure: which apps were installed or removed since the last look (roadmap W1).
 *
 * The phone compares its list of apps with the list it saved at the previous check-in, so an app
 * installed while Manara wasn't running is still seen, and nothing depends on a broadcast. The
 * first look after the parent turns this on only saves the list: apps already there are not news.
 */
object AppChangesDecision {
    const val INSTALLED = "installed"
    const val REMOVED = "removed"

    /** Longest app name sent; Android lets an app call itself anything. */
    const val MAX_LABEL = 60

    data class App(val packageName: String, val label: String, val installedAt: Long)

    data class Change(val action: String, val packageName: String, val label: String, val at: Long)

    /**
     * [previous]: package to name, as saved at the last look, or null before the first one.
     * [ownPackage] is never reported. An install keeps its own install time when Android gives a
     * believable one; a removal is dated now, the first moment the phone could see it.
     */
    fun changes(previous: Map<String, String>?, current: List<App>, ownPackage: String, now: Long): List<Change> {
        if (previous == null) return emptyList()
        val apps = current.filter { it.packageName != ownPackage }
        val names = apps.map { it.packageName }.toSet()
        val installed = apps.filter { it.packageName !in previous }.map {
            val at = if (it.installedAt in 1..now) it.installedAt else now
            Change(INSTALLED, it.packageName, trim(it.label), at)
        }
        val removed = previous.filterKeys { it !in names && it != ownPackage }.map { (pkg, label) ->
            Change(REMOVED, pkg, trim(label), now)
        }
        return (installed + removed).sortedWith(compareBy({ it.at }, { it.packageName }))
    }

    /** What to save for the next look: package to name, Manara itself left out. */
    fun snapshot(current: List<App>, ownPackage: String): Map<String, String> =
        current.filter { it.packageName != ownPackage }.associate { it.packageName to trim(it.label) }

    private fun trim(label: String): String = label.trim().take(MAX_LABEL)
}
