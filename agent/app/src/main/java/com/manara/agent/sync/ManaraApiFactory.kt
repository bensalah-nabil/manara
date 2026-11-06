package com.manara.agent.sync

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.manara.agent.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.create
import java.util.concurrent.TimeUnit

object ManaraApiFactory {
    /**
     * Dev-only default: `localhost` on the *device*, tunneled back to the
     * machine running `backend/` (`cd backend && docker compose up`) via
     * `adb reverse tcp:8080 tcp:8080` — not the PC's LAN IP directly, which
     * the Wi-Fi AP turned out to block client-to-client (`ping` from the
     * phone to the PC returned "Destination Host Unreachable" — AP
     * isolation, not a firewall or app bug, found testing on a real
     * network). The reverse tunnel rides the same ADB connection already
     * in use for everything else, so it isn't subject to that. Needs
     * `adb reverse` re-run after every reconnect (new wireless-debugging
     * session, phone reboot, etc.) — it doesn't persist on its own.
     * This used to point at the throwaway `stub-backend/` (same port, same
     * endpoints) — Phase 2's real backend replaced it with no agent-side
     * change needed, which is itself a confirmation the contract held.
     * Replace with a real deployed URL once there's one; see the
     * manifest's `usesCleartextTraffic` comment for the matching TLS note.
     */
    const val DEV_BASE_URL = "http://localhost:8080/api/v1/"

    /** MANARA_API_URL from local.properties at build time, or [DEV_BASE_URL]. */
    val BASE_URL: String = BuildConfig.API_BASE_URL

    fun create(baseUrl: String = BASE_URL): ManaraApi {
        val json = Json { ignoreUnknownKeys = true }
        // A free host that sleeps when idle takes up to about a minute to answer the first request.
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .callTimeout(120, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create()
    }
}
