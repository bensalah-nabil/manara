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

    testImplementation("junit:junit:4.13.2")
}
