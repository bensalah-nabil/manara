package com.manara.agent.sync

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/** Mirrors `api-spec/openapi.yaml`'s `/enroll`, `/agent/sync` and `/agent/setup` exactly. */
interface ManaraApi {
    @POST("enroll")
    suspend fun enroll(@Body request: EnrollRequest): Response<EnrollResponse>

    @POST("agent/sync")
    suspend fun sync(
        @Header("Authorization") bearerToken: String,
        @Body request: SyncRequest
    ): Response<SyncResponse>

    @POST("agent/setup")
    suspend fun reportSetup(
        @Header("Authorization") bearerToken: String,
        @Body request: SetupReportRequest
    ): Response<ResponseBody>
}

/** `accounts` null leaves the server's stored lists unchanged. */
@Serializable
data class SetupReportRequest(
    val step: String,
    val status: String,
    val message: String,
    val accounts: List<SetupAccountDto>? = null
)

@Serializable
data class SetupAccountDto(val type: String, val name: String)

@Serializable
data class DeviceInfo(
    val model: String,
    val manufacturer: String? = null,
    val androidVersion: String,
    val agentVersion: String? = null
)

@Serializable
data class EnrollRequest(val enrollmentToken: String, val deviceInfo: DeviceInfo)

@Serializable
data class EnrollResponse(val deviceId: String, val deviceToken: String, val policy: Policy)

@Serializable
data class CommandAck(val commandId: String, val status: String, val detail: String? = null)

@Serializable
data class SyncRequest(
    val policyVersion: Int,
    val events: List<Event>,
    val commandAcks: List<CommandAck>,
    // Omitted entirely (not even an empty string) when push isn't
    // configured -- see PushConfig.isConfigured -- so a build without
    // Firebase set up behaves exactly as it did before this field existed.
    val pushToken: String? = null
)

@Serializable
data class Command(
    val commandId: String,
    val type: String,
    val params: JsonObject = JsonObject(emptyMap()),
    val status: String,
    val createdAt: String
)

@Serializable
data class SyncResponse(
    val policyChanged: Boolean,
    val policy: Policy? = null,
    val pendingCommands: List<Command> = emptyList(),
    val acceptedEventIds: List<String> = emptyList()
)
