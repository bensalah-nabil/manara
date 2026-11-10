package com.manara.agent.text

import android.content.Context

/**
 * The app's wording, by string resource. Pure code asks for its text through this, so it stays
 * free of Android and unit tests can read the English from `res/values/strings.xml`.
 *
 * Numbers are formatted before they reach the resource (always Western digits, as used in
 * Tunisia), so every placeholder in strings.xml is `%s`.
 */
interface Words {
    fun get(id: Int, vararg args: Any): String

    fun plural(id: Int, count: Int): String
}

/** The phone's own language: Android picks `values`, `values-fr` or `values-ar`. */
class AndroidWords(private val context: Context) : Words {
    override fun get(id: Int, vararg args: Any): String =
        if (args.isEmpty()) context.getString(id) else context.getString(id, *args.map { it.toString() }.toTypedArray())

    override fun plural(id: Int, count: Int): String =
        context.resources.getQuantityString(id, count, count.toString())
}
