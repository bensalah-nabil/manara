// Top-level build file. Plugin versions are declared here and applied in :app.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Phase 1: Room needs an annotation processor (KSP, not kapt -- faster,
    // Kotlin-first) and kotlinx.serialization needs its own compiler plugin.
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.24" apply false
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
