package com.manara.agent.sync

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.create

object ManaraApiFactory {
    /**
     * Dev-only default: `localhost` on the *device*, tunneled back to the
     * machine running `stub-backend` (`cd stub-backend && go run .`) via
     * `adb reverse tcp:8080 tcp:8080` — not the PC's LAN IP directly, which
     * the Wi-Fi AP turned out to block client-to-client (`ping` from the
     * phone to the PC returned "Destination Host Unreachable" — AP
     * isolation, not a firewall or app bug, found testing on a real
     * network). The reverse tunnel rides the same ADB connection already
     * in use for everything else, so it isn't subject to that. Needs
     * `adb reverse` re-run after every reconnect (new wireless-debugging
     * session, phone reboot, etc.) — it doesn't persist on its own.
     * Replace once Phase 2's real backend exists; see the manifest's
     * `usesCleartextTraffic` comment for the matching TLS note.
     */
    const val DEV_BASE_URL = "http://localhost:8080/api/v1/"

    fun create(baseUrl: String = DEV_BASE_URL): ManaraApi {
        val json = Json { ignoreUnknownKeys = true }
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create()
    }
}
