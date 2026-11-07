package com.manara.agent.setup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SetupInputTest {

    @Test
    fun `a pairing code is exactly six digits`() {
        assertTrue(SetupInput.isPairingCode("042137"))
        for (text in listOf("", "12345", "1234567", "12a456", " 123456", "123456; rm -rf /")) {
            assertFalse(text, SetupInput.isPairingCode(text))
        }
    }

    @Test
    fun `package lines are read from pm output, ignoring noise`() {
        val output = "package:/data/app/~~x==/com.whatsapp-y==/base.apk\r\npackage:/data/app/~~x==/com.whatsapp-y==/split_config.arm64_v8a.apk\nWARNING: linker\n"
        assertEquals(
            listOf("/data/app/~~x==/com.whatsapp-y==/base.apk", "/data/app/~~x==/com.whatsapp-y==/split_config.arm64_v8a.apk"),
            SetupInput.packageLines(output),
        )
    }

    @Test
    fun `only plain package names and apk paths can reach a shell command`() {
        assertTrue(SetupInput.isSafePackageName("com.whatsapp"))
        assertTrue(SetupInput.isSafePackageName("com.google.android.apps.tachyon"))
        for (bad in listOf("whatsapp", "com.whatsapp; reboot", "com.whatsapp\nreboot", "com..x", "-k com.x", "\$(id).x")) {
            assertFalse(bad, SetupInput.isSafePackageName(bad))
        }
        assertTrue(SetupInput.isSafeApkPath("/data/app/~~x==/com.whatsapp-y==/base.apk"))
        for (bad in listOf("/data/app/a b.apk", "/data/app/x.apk; reboot", "/data/../x.apk", "relative/base.apk", "/data/app/base.so")) {
            assertFalse(bad, SetupInput.isSafeApkPath(bad))
        }
    }

    @Test
    fun `pm success is its own Success line, not a Failure message mentioning it`() {
        assertTrue(SetupInput.pmSucceeded("Success\n"))
        assertFalse(SetupInput.pmSucceeded("Failure [DELETE_FAILED_INTERNAL_ERROR]"))
        assertFalse(SetupInput.pmSucceeded("Failure [not Success]"))
    }
}
