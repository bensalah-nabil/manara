package com.manara.agent.sync

import com.manara.agent.events.Event
import com.manara.agent.policy.Policy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

/** Mirrors `api-spec/openapi.yaml`'s `/enroll`, `/agent/sync`, `/agent/setup` and `/agent/setup/input` exactly. */
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

    @GET("agent/setup/input")
    suspend fun setupInput(@Header("Authorization") bearerToken: String): Response<SetupInputDto>

    /** The waiting screen's checklist, so the parent's console ticks along with the phone. */
    @POST("agent/setup/readiness")
    suspend fun reportReadiness(
        @Header("Authorization") bearerToken: String,
        @Body request: SetupReadinessRequest
    ): Response<ResponseBody>
}

/** Null: this phone wouldn't say. Mirrors `SetupReadiness` in `api-spec/openapi.yaml`. */
@Serializable
data class SetupReadinessRequest(
    val android: Boolean,
    val wifi: Boolean?,
    val batteryPercent: Int?,
    val charging: Boolean,
    val developerOptions: Boolean?,
    val wirelessDebugging: Boolean?,
    val ready: Boolean,
)

/** `accounts` null leaves the server's stored lists unchanged. */
@Serializable
data class SetupReportRequest(
    val step: String,
    val status: String,
    val message: String,
    val accounts: List<SetupAccountDto>? = null,
    /** Only on pairing-step reports, until the server has the QR code's name and password. */
    val pairing: SetupPairingDto? = null,
)

@Serializable
data class SetupPairingDto(val name: String, val password: String)

/** What the parent typed in the console; [pairingCodeSeq] numbers each code sent. */
@Serializable
data class SetupInputDto(
    val pairingCode: String? = null,
    val pairingCodeSeq: Int = 0,
    val finish: Boolean = false,
    /** What the phone had before an earlier run that didn't finish: still to sign back in to. */
    val earlierAccounts: List<SetupAccountDto> = emptyList(),
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
data class EnrollResponse(
    val deviceId: String,
    val deviceToken: String,
    val policy: Policy,
    /** Base64; checks a parent's offline release code. Absent from a server older than release codes. */
    val releaseSecret: String? = null
)

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
    val pushToken: String? = null,
    /** False asks the server for the release secret (a phone enrolled before release codes). */
    val hasReleaseSecret: Boolean = false,
    /** This build's version, so the console shows what the phone runs now, not at enrollment. */
    val agentVersion: String? = null
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
    val acceptedEventIds: List<String> = emptyList(),
    val releaseSecret: String? = null,
    /** The server has removed this phone after its release ack. */
    val released: Boolean = false
)
