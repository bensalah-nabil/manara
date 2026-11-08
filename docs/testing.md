# Testing Manara

Manara's riskiest code runs once per phone, on hardware we don't own, and a
mistake can cost a family its apps or leave a child's phone unmanaged. No
single tool covers that, so testing is layered, each layer catching what it
can catch cheaply.

| Layer | What it catches | Where | Cost | Run |
| --- | --- | --- | --- | --- |
| 1. Unit and chaos tests | Logic errors, and orders of events nobody planned for | This PC, every build | Free, seconds | `./gradlew.bat testDebugUnitTest` |
| 2. Emulator matrix | Android-version differences in device-owner behaviour | This PC | Free, minutes; ~1 GB per Android version once | `./gradlew.bat matrixGroupDebugAndroidTest` |
| 3. Real phones in the cloud | Maker- and model-specific crashes, release-build-only bugs | Google's labs | Free tiers | Play pre-launch report; `tools/test-lab/run.sh` |
| 4. The field | What only real families hit | Every phone | Free | Play Console Android vitals; setup reports in the console |

## 1. Unit and chaos tests

Pure logic (decisions, the setup flow) is unit-tested; Android calls are thin
wrappers around it (CLAUDE.md). On top of that, `SetupChaosTest` runs guided
setup through 5,000 random simulated phones and parents in about a second:
any step can fail, accounts linger after an app is uninstalled, the parent
adds an account mid-way or leaves, extra users come and go, uninstall and
restore fail halfway. After every step it checks the rules that protect a
family:

- no app is uninstalled while an account the parent must remove, an orphaned
  account or another user remains;
- device owner is only attempted after an empty account list;
- every uninstalled app is put back, unless every attempt failed (counted);
- wireless debugging is always turned off;
- the sign-back-in list keeps everything the phone had;
- nothing destructive happens after a failure; "done" means device owner.

A failure prints its seed; set the loop to that seed to replay the exact run.
It found three ways to lose a parent's app in its first minutes (commit
`5f31288`). When a new kind of trouble shows up on a real phone, add it to
the simulated phone rather than writing one more hand-made case.

The server has the same split: Go unit tests, plus database tests that run
only against a throwaway database (backend/README.md, "Database tests").

## 2. Emulator matrix

`ManagedMatrixTest` makes a clean emulator device owner with the test's shell
rights (as guided setup does with adb), applies every rule through the real
enforcer registry, checks what Android reports, lifts the rules and releases
the emulator. Gradle downloads, starts and wipes the emulators itself
(`testOptions.managedDevices` in `agent/app/build.gradle.kts`): Android 11, 13,
14, 15 and 16. One version: `./gradlew.bat api34DebugAndroidTest`.

It refuses to run on a real phone, and on any phone Manara already manages:
it changes the rules and releases the phone at the end.

What it can't cover: guided setup itself (there is no Wireless debugging
screen to drive), makers' changes to Android (emulators are stock Android),
and Google Play services.

## 3. Real phones in the cloud

**Play pre-launch report.** Runs by itself when a bundle is uploaded to a
testing track: Google crawls the app on a broad mix of real phones (Android 9
and up) and reports crashes, compatibility and accessibility problems. Free.
It sees the screens a new install shows; it can't enroll a phone.

**Firebase Test Lab.** Chosen real models, through `tools/test-lab/run.sh`
(setup steps at the top of the script; phones listed in `models.txt`). `robo`
crawls the store build; `matrix` runs `ManagedMatrixTest` on each phone, which
Test Lab wipes afterwards (`throwawayDevice=true`). A farm phone signed in to
a Google account can't become device owner; the test reports that as skipped.
No-cost plan: 5 real-phone runs a day. Test Lab is deprecated and shuts down
on 2027-09-30 (gcloud reference), so don't build anything else on it.

**Samsung Remote Test Lab** offers real Galaxy phones with adb, but its docs
say installing apps that require device admin permission is disabled, which
rules Manara out. Untested.

## 4. The field

Play Console's Android vitals shows crashes and freezes from installed phones
without any SDK in the app. Guided setup already reports every step and
failure to the server, and the console shows it; a failure there is the
first thing to read when a parent says setup didn't work.

## Release builds

Some bugs exist only in release builds (R8 removed WorkManager's input merger;
a build without `-PMANARA_API_URL` talked to localhost). Test push, setup and
anything reached by reflection on a release build on a phone before shipping.
