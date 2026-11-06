pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Kadb's SPAKE2 dependency is published only on JitPack; nothing else may come from there.
        exclusiveContent {
            forRepository { maven("https://jitpack.io") }
            filter { includeModule("com.github.Flyfish233", "spake2-java") }
        }
    }
}

rootProject.name = "manara-agent"
include(":app")
