package com.manara.agent.text

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** French and Arabic must cover every English string, with the same placeholders. */
class StringCataloguesTest {
    private val english = ResourceWords()
    private val others = mapOf(
        "fr" to ResourceWords("src/main/res/values-fr/strings.xml"),
        "ar" to ResourceWords("src/main/res/values-ar/strings.xml"),
    )
    /** Marked translatable="false" in values/strings.xml. */
    private val untranslated = setOf("app_name", "chrome_title")

    private fun placeholders(text: String): List<String> = Regex("%[0-9][$]s").findAll(text).map { it.value }.sorted().toList()

    @Test
    fun everyStringIsTranslated() {
        others.forEach { (language, words) ->
            assertEquals("strings in $language", english.stringNames - untranslated, words.stringNames)
            assertEquals("plurals in $language", english.pluralNames, words.pluralNames)
        }
    }

    @Test
    fun placeholdersMatch() {
        others.forEach { (language, words) ->
            words.stringNames.forEach { name ->
                assertEquals("$language $name", placeholders(english.raw(name)!!), placeholders(words.raw(name)!!))
            }
        }
    }

    @Test
    fun everyPlaceholderIsAString() {
        (others.values + english).forEach { words ->
            words.stringNames.forEach { name ->
                val text = words.raw(name)!!
                assertTrue("$name: only %n\$s placeholders", Regex("%(?![0-9][$]s)").find(text) == null)
            }
        }
    }

    @Test
    fun arabicHasEveryPluralForm() {
        val arabic = others.getValue("ar")
        arabic.pluralNames.forEach { name ->
            assertEquals(name, setOf("zero", "one", "two", "few", "many", "other"), arabic.rawPlural(name)!!.keys)
        }
    }
}
