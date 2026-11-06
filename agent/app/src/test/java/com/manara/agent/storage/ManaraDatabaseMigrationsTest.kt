package com.manara.agent.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManaraDatabaseMigrationsTest {
    @Test
    fun everyEarlierVersionHasAPathToTheCurrentOne() {
        val next = ManaraDatabase.MIGRATIONS.associate { it.startVersion to it.endVersion }
        for (from in 1 until MANARA_DB_VERSION) {
            var version = from
            while (version < MANARA_DB_VERSION) {
                version = next[version]
                    ?: throw AssertionError("No migration from version $version (needed to upgrade a phone on version $from)")
            }
            assertEquals("Upgrade from $from overshoots", MANARA_DB_VERSION, version)
        }
    }

    @Test
    fun migrationsGoForwardOneStepAndAreNotDuplicated() {
        val starts = ManaraDatabase.MIGRATIONS.map { it.startVersion }
        assertEquals("Two migrations start at the same version", starts.size, starts.toSet().size)
        ManaraDatabase.MIGRATIONS.forEach {
            assertTrue("Migration ${it.startVersion}->${it.endVersion} must step forward by one", it.endVersion == it.startVersion + 1)
        }
        assertTrue("No migration may go past the current version", ManaraDatabase.MIGRATIONS.all { it.endVersion <= MANARA_DB_VERSION })
    }
}
