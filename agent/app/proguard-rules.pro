# R8 rules for the release build. Retrofit, OkHttp, Room, WorkManager, Firebase and
# kotlinx.serialization ship their own consumer rules; only gaps found by building
# the release variant are added here, each with the reason.

# Firebase and ML Kit find their components by reflection on a no-argument
# constructor; R8 removed them in the release build (seen on the SM-A045F as
# "NoSuchMethodException: ...Registrar.<init>" from ComponentDiscovery).
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
