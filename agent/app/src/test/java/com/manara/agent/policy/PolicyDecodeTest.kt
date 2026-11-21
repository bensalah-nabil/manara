package com.manara.agent.policy

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A policy with a null where the phone expects a list once made every sync fail to parse, so the
 * phone never got another rule or command (audit 2026-11-21). The same settings as
 * ManaraApiFactory and PolicyCache: unknown keys ignored, nulls coerced to the field's default.
 */
class PolicyDecodeTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `a bedtime window with null days reads as no days instead of failing`() {
        val policy = json.decodeFromString(
            Policy.serializer(),
            """{"version":5,"lockSchedule":{"enabled":true,"windows":[{"days":null,"fromHour":22,"toHour":7}]}}""",
        )
        val window = policy.lockSchedule!!.windows.single()
        assertEquals(emptyList<Int>(), window.days)
        assertEquals(22, window.fromHour)
        assertEquals(5, policy.version)
    }
}
