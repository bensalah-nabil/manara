import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
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
// Release signing: the upload key stays outside the repository. Set in local.properties
// (or -P): MANARA_KEYSTORE (path), MANARA_KEYSTORE_PASSWORD, MANARA_KEY_ALIAS, MANARA_KEY_PASSWORD.
fun buildSetting(key: String): String? = (findProperty(key) as String?) ?: localProperties.getProperty(key)

// Play needs a higher versionCode for every upload: -PMANARA_VERSION_CODE=N.
val manaraVersionCode: Int = buildSetting("MANARA_VERSION_CODE")?.toInt() ?: 1
val manaraVersionName: String = buildSetting("MANARA_VERSION_NAME") ?: "1.0.0"

val manaraApiUrl: String = ((findProperty("MANARA_API_URL") as String?)
    ?: localProperties.getProperty("MANARA_API_URL", "http://localhost:8080/api/v1/"))
    .let { if (it.endsWith("/")) it else "$it/" }

// A release build without MANARA_API_URL silently talked to localhost on a real phone, which then
// could not check in at all (2026-11-07). Play builds must name the deployed HTTPS server.
val checkReleaseApiUrl by tasks.registering {
    val url = manaraApiUrl
    doLast {
        check(url.startsWith("https://")) {
            "A release build needs the deployed server: -PMANARA_API_URL=https://... (got $url)"
        }
    }
}
tasks.configureEach { if (name.startsWith("pre") && name.endsWith("ReleaseBuild")) dependsOn(checkReleaseApiUrl) }

// Android 17 blocks local network access for apps targeting API 37 unless they hold
// ACCESS_LOCAL_NETWORK (developer.android.com, Local network permission). Guided setup connects
// to the phone's own Wi-Fi address and uses NsdManager, so raising the target without the
// permission would break setup silently. docs/play-store.md has what setup must change.
val checkLocalNetworkPermission by tasks.registering {
    val target = android.defaultConfig.targetSdk ?: 0
    val manifest = file("src/main/AndroidManifest.xml")
    doLast {
        check(target < 37 || manifest.readText().contains("android.permission.ACCESS_LOCAL_NETWORK")) {
            "targetSdk $target needs ACCESS_LOCAL_NETWORK for guided setup: see docs/play-store.md, Local network permission"
        }
    }
}
tasks.configureEach { if (name == "preBuild") dependsOn(checkLocalNetworkPermission) }

android {
    namespace = "com.manara.agent"
    // Kadb requires compileSdk 37.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.manara.agent"
        // Guided setup (wireless debugging) needs Android 11; Play only offers the app where it can be set up.
        minSdk = 30
        // Google Play requires 36 for new apps since 2026-08-31. Checked against the Android 15
        // and 16 behaviour changes: no boot-restricted FGS types, Compose handles edge-to-edge
        // and predictive back. docs/play-store.md lists what is still to watch.
        targetSdk = 36
        versionCode = manaraVersionCode
        versionName = manaraVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "FCM_API_KEY", "\"${fcmProperty("FCM_API_KEY")}\"")
        buildConfigField("String", "FCM_APP_ID", "\"${fcmProperty("FCM_APP_ID")}\"")
        buildConfigField("String", "FCM_PROJECT_ID", "\"${fcmProperty("FCM_PROJECT_ID")}\"")
        buildConfigField("String", "FCM_SENDER_ID", "\"${fcmProperty("FCM_SENDER_ID")}\"")
        buildConfigField("String", "API_BASE_URL", "\"$manaraApiUrl\"")
        buildConfigField("String", "PRIVACY_URL", "\"${buildSetting("MANARA_PRIVACY_URL") ?: "https://manara-rosy.vercel.app/privacy.html"}\"")
        // Plain HTTP is only allowed when the configured server itself is plain HTTP (local dev).
        manifestPlaceholders["usesCleartextTraffic"] = manaraApiUrl.startsWith("http://").toString()
    }

    signingConfigs {
        create("release") {
            buildSetting("MANARA_KEYSTORE")?.let { path ->
                storeFile = file(path)
                storePassword = buildSetting("MANARA_KEYSTORE_PASSWORD")
                keyAlias = buildSetting("MANARA_KEY_ALIAS")
                keyPassword = buildSetting("MANARA_KEY_PASSWORD")
            }
        }
    }

    // The emulator matrix (app/src/androidTest/.../matrix): ./gradlew.bat matrixGroupDebugAndroidTest
    // Gradle downloads, starts and wipes these emulators itself. "aosp" images: no Google account,
    // so set-device-owner works, as on a phone whose accounts guided setup removed.
    testOptions {
        managedDevices {
            localDevices {
                mapOf("api30" to 30, "api33" to 33, "api34" to 34, "api35" to 35, "api36" to 36).forEach { (name, level) ->
                    create(name) {
                        device = "Pixel 6"
                        apiLevel = level
                        systemImageSource = "aosp"
                    }
                }
            }
            groups {
                create("matrix") {
                    listOf("api30", "api33", "api34", "api35", "api36").forEach { targetDevices.add(localDevices[it]) }
                }
            }
        }
    }

    // The same app twice. `play` can't read calls; `direct`, installed outside Google Play, can
    // when the parent turns call history on (ADR-0008). Only the manifest differs.
    flavorDimensions += "distribution"
    productFlavors {
        create("play") { dimension = "distribution" }
        create("direct") { dimension = "distribution" }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Unsigned when no key is configured, so a release build never silently uses a debug key.
            signingConfigs.getByName("release").takeIf { it.storeFile != null }?.let { signingConfig = it }
        }
        // The release build (R8, no debugging) signed with the debug key, so it installs as an
        // update over a debug build on a phone Manara already manages. For testing; Play rejects it.
        create("qa") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += "release"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        compose = true
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

    // The app's few screens: Compose with Material 3 (Google's current UI toolkit).
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
}
