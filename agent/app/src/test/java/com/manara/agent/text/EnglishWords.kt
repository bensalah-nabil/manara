package com.manara.agent.text

import com.manara.agent.R
import org.w3c.dom.Element
import java.io.File
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory

/** The English wording, read from `res/values/strings.xml`, for unit tests of pure code. */
class ResourceWords(file: String = "src/main/res/values/strings.xml") : Words {
    private val strings = mutableMapOf<String, String>()
    private val plurals = mutableMapOf<String, Map<String, String>>()

    init {
        val root = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(file)).documentElement
        val nodes = root.childNodes
        for (i in 0 until nodes.length) {
            val node = nodes.item(i) as? Element ?: continue
            when (node.tagName) {
                "string" -> strings[node.getAttribute("name")] = unescape(node.textContent)
                "plurals" -> {
                    val items = node.getElementsByTagName("item")
                    plurals[node.getAttribute("name")] = (0 until items.length).associate {
                        val item = items.item(it) as Element
                        item.getAttribute("quantity") to unescape(item.textContent)
                    }
                }
            }
        }
    }

    val stringNames: Set<String> get() = strings.keys
    val pluralNames: Set<String> get() = plurals.keys

    fun raw(name: String): String? = strings[name]
    fun rawPlural(name: String): Map<String, String>? = plurals[name]

    override fun get(id: Int, vararg args: Any): String {
        val text = strings.getValue(name(R.string::class.java, id))
        return if (args.isEmpty()) text else String.format(Locale.ROOT, text, *args.map { it.toString() }.toTypedArray())
    }

    /** English rule only: one, other. */
    override fun plural(id: Int, count: Int): String {
        val forms = plurals.getValue(name(R.plurals::class.java, id))
        val text = (if (count == 1) forms["one"] else null) ?: forms.getValue("other")
        return String.format(Locale.ROOT, text, count.toString())
    }

    private fun name(type: Class<*>, id: Int): String =
        type.fields.first { it.getInt(null) == id }.name

    /** As Android reads a resource: outer whitespace dropped unless the text is in double quotes. */
    private fun unescape(text: String): String =
        text.trim().let { if (it.length >= 2 && it.startsWith('"') && it.endsWith('"')) it.substring(1, it.length - 1) else it }.replace("""\'""", "'").replace("\\\"", "\"").replace("""\n""", "\n").replace("""\@""", "@").replace("""\?""", "?")
}

val English: Words = ResourceWords()
