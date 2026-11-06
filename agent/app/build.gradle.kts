import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

// Firebase project identity for push notifications, read from
// local.properties (already gitignored -- sdk.dir already lives there)
// rather than google-services.json/the Google Services Gradle plugin, so
// the build doesn't require a Firebase project to exist at all until
// someone actually wants push working. See PushConfig.kt.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun fcmProperty(key: String): String = localProperties.getProperty(key, "")

// The server the phone talks to: -PMANARA_API_URL=... or MANARA_API_URL in local.properties for a
// deployed server; without either the build keeps the dev default (adb reverse to localhost).
val manaraApiUrl: String = ((findProperty("MANARA_API_URL") as String?)
    ?: localProperties.getProperty("MANARA_API_URL", "http://localhost:8080/api/v1/"))
    .let { if (it.endsWith("/")) it else "$it/" }

android {
    namespace = "com.manara.agent"
    // Kadb requires compileSdk 37. targetSdk stays 34 on purpose: raising it changes runtime behaviour.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.manara.agent"
        minSdk = 26          // Android 8.0 — needed for notification channels
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-phase0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "FCM_API_KEY", "\"${fcmProperty("FCM_API_KEY")}\"")
        buildConfigField("String", "FCM_APP_ID", "\"${fcmProperty("FCM_APP_ID")}\"")
        buildConfigField("String", "FCM_PROJECT_ID", "\"${fcmProperty("FCM_PROJECT_ID")}\"")
        buildConfigField("String", "FCM_SENDER_ID", "\"${fcmProperty("FCM_SENDER_ID")}\"")
        buildConfigField("String", "API_BASE_URL", "\"$manaraApiUrl\"")
        // Plain HTTP is only allowed when the configured server itself is plain HTTP (local dev).
        manifestPlaceholders["usesCleartextTraffic"] = manaraApiUrl.startsWith("http://").toString()
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    // BouncyCastle (via Kadb) ships identical copies of these in several jars; keep one, don't drop the license.
    packaging {
        resources {
            pickFirsts += setOf("META-INF/LICENSE.md", "META-INF/versions/9/OSGI-INF/MANIFEST.MF")
        }
    }
}

// One JSON file per Room schema version, committed, so a later change can be checked against what shipped.
ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    // Phase 0 kept this empty on purpose, to keep the Play Protect surface
    // small. Phase 1's offline-first core (architecture.md §2.1) genuinely
    // needs local persistence, so that ends here: Room is AndroidX (Google's
    // own library, not a third-party risk) and kotlinx.serialization is
    // Kotlin-first with no reflection.
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    // Pinned to Kadb's version: on-device tests load shared classes from the app, and Kadb calls 1.11 APIs.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")

    // Phase 1 step 5: the sync loop (architecture.md §3) needs a client for
    // the v1 API and a periodic job to drive it. Retrofit + the
    // kotlinx.serialization converter (Jake Wharton's, the de facto
    // standard since Square doesn't ship one) keeps the same JSON library
    // used everywhere else in the agent; WorkManager is AndroidX, same
    // non-third-party-risk reasoning as Room.
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    // Forced explicitly -- something else in the graph was pulling OkHttp
    // 3.14.9 transitively, which predates the Kotlin toMediaType() extension
    // ManaraApiFactory needs.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Phase 1 step 6: QR enrollment. Google's own "code scanner" module --
    // not CameraX + ML Kit wired up by hand -- launches a full scanning UI
    // itself and needs no CAMERA permission in this app's own manifest (the
    // scanner module handles that internally). Requires Play Services,
    // already present on this target hardware (Samsung, GMS).
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    // Finishing Phase 1: LocationEnforcer's FusedLocationProviderClient.
    // Pinned below the newest (21.4.0) on purpose -- that one's Kotlin
    // metadata (2.3.0) is incompatible with this project's Kotlin 1.9.24
    // ("compiled with an incompatible version of Kotlin" at kspDebugKotlin,
    // found immediately on first build). 21.1.1 predates that shift.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Push notifications (FCM) -- additive, see PushConfig.kt: a build
    // without local.properties' FCM_* keys set runs exactly as before this
    // existed. No firebase-bom/google-services plugin -- FirebaseMessaging
    // is initialized manually with four plain config strings instead
    // (PushConfig.ensureFirebaseInitialized), so push doesn't need a
    // Firebase project to exist just to compile.
    implementation("com.google.firebase:firebase-messaging:24.1.1")

    // Guided setup talks to this phone's own wireless debugging; only fixed commands (setup/AdbSetupDevice).
    implementation("com.flyfishxu:kadb:2.1.5")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
}
