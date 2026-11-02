# Manara Agent — Phase 0 (device-owner proof)

The point of this app is **not** to manage anything. It does the smallest
possible thing that proves the project is viable:

1. It can be installed on a real phone.
2. It can become **device owner** via ADB on a factory-reset device.
3. It survives a reboot and keeps running without being killed.
4. Play Protect does not flag or block it.

If all four hold on a Samsung *and* a Xiaomi, Phase 0 passes and the rest of
the project is worth building. If they don't, we learn it now — before writing a
backend. See [`../docs/roadmap.md`](../docs/roadmap.md), Phase 0.

What the app actually does when running: shows one screen saying whether it is
device owner, and runs a **visible** foreground service with a permanent
notification — the "this device is managed" marker that the whole project is
built around (ADR-0001). Even the throwaway test app is honest by construction.

---

## Build (no Android Studio needed)

Requires a JDK (17+) and the Android SDK command-line tools. With `ANDROID_HOME`
set:

```bash
cd agent
./gradlew assembleDebug
# output: app/build/outputs/apk/debug/app-debug.apk
```

First run downloads the Gradle wrapper and Android dependencies, so it needs
network and a few minutes.

## Test on a factory-reset phone

> Device owner can normally only be set on a device with **no accounts added**
> — i.e. freshly factory-reset, skip the Google sign-in during setup. On a phone
> with accounts, `set-device-owner` fails. Use a spare/test phone.

```bash
# 1. Enable Developer options + USB debugging on the phone, plug in USB.
adb devices                     # confirm the phone is listed

# 2. Install the APK
adb install app/build/outputs/apk/debug/app-debug.apk

# 3. Make Manara the device owner
adb shell dpm set-device-owner com.manara.agent/.OwnerReceiver
#   success looks like: "Success: Device owner set to package ..."

# 4. Open the app — it should say "Device owner: YES"
# 5. Reboot the phone, wait, reopen — notice should still be there,
#    device owner still YES.
```

### Removing it (cleanup)

Device owner can't be uninstalled normally. To remove:

```bash
adb shell dpm remove-active-admin com.manara.agent/.OwnerReceiver
adb uninstall com.manara.agent
```

(If that's blocked, a factory reset always clears it.)

## What to record for the Phase 0 report

For each phone (model, Android version):
- [ ] `set-device-owner` succeeded?
- [ ] App shows "Device owner: YES"?
- [ ] Notice survives reboot + 24h idle?
- [ ] Play Protect warning at install or later? (screenshot if so)
