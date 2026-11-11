package com.manara.agent.setup

/**
 * Pure. Is the phone ready for guided setup, and which Settings screen should the parent open
 * next? The phone checks this itself, so the parent no longer ticks a checklist (roadmap,
 * "make enrollment easier", item 1-3). [SetupReadinessReader] reads the phone; this decides.
 *
 * Platform facts (AOSP android15-release): `Settings.Global.DEVELOPMENT_SETTINGS_ENABLED` is
 * public API; `adb_wifi_enabled` is `@hide` but `@Readable` with no target-SDK cap
 * (`Settings.java`), so `SettingsProvider.checkReadableAnnotation` lets any app read it.
 */
object SetupReadiness {

    enum class Item { ANDROID, WIFI, BATTERY, DEVELOPER_OPTIONS, WIRELESS_DEBUGGING }

    enum class State { OK, MISSING, UNKNOWN }

    /** The Settings screen that fixes the first missing item. */
    enum class Action { OPEN_WIFI, OPEN_ABOUT_PHONE, OPEN_DEVELOPER_OPTIONS }

    /** What the phone read. Null: this phone wouldn't say. */
    data class Snapshot(
        val sdkInt: Int,
        val wifi: Boolean?,
        val batteryPercent: Int?,
        val charging: Boolean,
        val developerOptions: Boolean?,
        val wirelessDebugging: Boolean?,
    )

    /** Battery is advice, not a blocker: setup works on a low battery, it just mustn't run out. */
    data class Line(val item: Item, val state: State, val required: Boolean)

    data class Result(val lines: List<Line>, val ready: Boolean, val next: Action?)

    /** Guided setup pairs over wireless debugging, which Android offers from Android 11. */
    const val MIN_SDK = 30
    const val MIN_BATTERY = 50

    fun evaluate(s: Snapshot): Result {
        fun state(value: Boolean?) = when (value) {
            true -> State.OK
            false -> State.MISSING
            null -> State.UNKNOWN
        }
        val battery = when {
            s.charging -> State.OK
            s.batteryPercent == null -> State.UNKNOWN
            s.batteryPercent >= MIN_BATTERY -> State.OK
            else -> State.MISSING
        }
        val lines = listOf(
            Line(Item.ANDROID, if (s.sdkInt >= MIN_SDK) State.OK else State.MISSING, required = true),
            Line(Item.WIFI, state(s.wifi), required = true),
            Line(Item.BATTERY, battery, required = false),
            Line(Item.DEVELOPER_OPTIONS, state(s.developerOptions), required = true),
            // Wireless debugging lives inside Developer options, and Android turns it off off Wi-Fi.
            Line(Item.WIRELESS_DEBUGGING, state(s.wirelessDebugging), required = true),
        )
        // A setting this phone wouldn't report doesn't block: the parent can still start.
        val ready = lines.none { it.required && it.state == State.MISSING }
        val next = when {
            s.sdkInt < MIN_SDK -> null
            s.wifi == false -> Action.OPEN_WIFI
            s.developerOptions == false -> Action.OPEN_ABOUT_PHONE
            s.wirelessDebugging == false -> Action.OPEN_DEVELOPER_OPTIONS
            else -> null
        }
        return Result(lines, ready, next)
    }
}
