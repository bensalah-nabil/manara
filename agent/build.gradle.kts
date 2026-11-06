// Top-level build file. Plugin versions are declared here and applied in :app.
// AGP 9 compiles Kotlin itself (no kotlin-android plugin). Kadb needs Kotlin 2.4,
// above AGP's bundled 2.2.10, so the Kotlin Gradle plugin is raised here.
buildscript {
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.20")
    }
}

plugins {
    // 9.5 is the first AGP that supports compileSdk 37, which Kadb requires.
    id("com.android.application") version "9.5.0" apply false
    // Phase 1: Room needs an annotation processor (KSP, not kapt -- faster,
    // Kotlin-first) and kotlinx.serialization needs its own compiler plugin.
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.20" apply false
    id("com.google.devtools.ksp") version "2.3.13" apply false
}
