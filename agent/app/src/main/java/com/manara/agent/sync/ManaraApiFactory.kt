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
     * Set at build time (app/build.gradle.kts: -PMANARA_API_URL or local.properties); a release
     * build refuses to build without an HTTPS one. A debug build without it uses `localhost:8080`
     * on the phone, which reaches the PC's backend only through `adb reverse tcp:8080 tcp:8080`,
     * re-run after every reconnect (the PC's LAN address is often blocked by Wi-Fi client isolation).
     */
    val BASE_URL: String = BuildConfig.API_BASE_URL

    fun create(baseUrl: String = BASE_URL): ManaraApi {
        // coerceInputValues: a null where the phone expects a value takes the field's default
        // instead of failing the whole sync response (Policy.LockSchedule.Window.days).
        val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
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
