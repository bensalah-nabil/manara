plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.manara.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.manara.agent"
        minSdk = 26          // Android 8.0 — needed for notification channels
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-phase0"
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

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Phase 0 kept this empty on purpose, to keep the Play Protect surface
    // small. Phase 1's offline-first core (architecture.md §2.1) genuinely
    // needs local persistence, so that ends here: Room is AndroidX (Google's
    // own library, not a third-party risk) and kotlinx.serialization is
    // Kotlin-first with no reflection.
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

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

    testImplementation("junit:junit:4.13.2")
}
