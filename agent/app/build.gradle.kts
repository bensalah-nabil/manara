plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
    // Intentionally none — Phase 0 uses only the Android framework, to keep the
    // app minimal and the Play Protect surface as small as possible.
}
