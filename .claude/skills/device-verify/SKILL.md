---
name: device-verify
description: How to check a Manara change on a real phone or the emulator over adb — connect, install, sync, read the result, capture logs, and avoid the traps that already produced false results. Use whenever code touching DevicePolicyManager, UsageStatsManager, notifications, WorkManager, guided setup or release must be "verified on a phone", or when asked to test on the A52, A045F, emulator, or to "see logs".
---

# Verify on a device

CLAUDE.md: code touching `DevicePolicyManager`, `UsageStatsManager`, `AccessibilityService` or
notifications is not done until it ran on a phone. This is how, without fooling yourself.

## Ground rules

- **The phones are in use** by real families. Reading state (dumpsys, logcat, screenshots) is fine.
  Ask first before anything that changes their data: uninstall, clear data, release, reset, removing
  accounts, `pm disable-user`. Installing an update with `adb install -r` keeps data; still say so
  before doing it, and never while guided setup is running (an update kills the process mid-setup).
- Try risky paths on the emulator (`manara_owner_test`, Android 14) first. An emulator pass does not
  carry over to Samsung for anything about accounts (CLAUDE.md, "set-device-owner ... cached count").
- Report exactly what ran where: model, Android version, Manara `versionName`, debug or release.

## 1. Connect

```
export MSYS_NO_PATHCONV=1        # Git Bash rewrites /paths before adb.exe sees them
A=/c/Users/nbensalah/AppData/Local/Android/Sdk/platform-tools/adb.exe
$A devices -l
$A mdns services                 # wireless debugging's current IP:port (it changes on every reconnect)
$A connect <ip>:<port>
$A -s <ip:port> shell getprop ro.serialno   # key any saved state by this, never by IP:port
```

Inside a `while read` loop, give every adb call `</dev/null`, or adb eats the loop's input.

## 2. Read the state first (read-only)

```
$A -s $S shell "dumpsys package com.manara.agent | grep -E 'versionCode|versionName'; \
  dumpsys device_policy | grep -E 'Device Owner|admin=ComponentInfo' | head -3; \
  dumpsys battery | grep -E 'level|powered: true'; \
  dumpsys account | grep -E 'Account \{'; \
  dumpsys notification --noredact | grep -E 'NotificationRecord\(.*pkg=com.manara'"
$A -s $S exec-out screencap -p > <scratchpad>/shot.png   # then Read it
```

Notification ids: 1001 managed notice, 1003 guided setup. Plug in a phone below ~20% before any long test.

## 3. Install

- `$A -s $S install -r <apk>` keeps data. A debug and a release build are signed differently: switching
  between them needs an uninstall, which deletes data, so ask.
- A **release** APK must come from `release-check` (HTTPS server URL, keep rules).
- A **debug** build talks to `localhost:8080`: start the stack (`cd backend && docker compose up -d`,
  with `--build server` after any change in `backend/internal/domain`) and run
  `$A -s $S reverse tcp:8080 tcp:8080` **after every reconnect or reboot**. Judge the tunnel by a sync
  result, not by `reverse --list` (a listed tunnel can be dead; remove and re-add it).

## 4. Make it act

- **Sync:** tap "Check now" on the phone, or enqueue a real `OneTimeWorkRequest`.
  `adb shell cmd jobscheduler run -f` does not reliably run WorkManager jobs.
- **Commands** (lock, release, location): send them through the console API
  (`POST /api/v1/console/devices/{id}/commands`), the same path parents use.
- **Local test parent:** `docker compose exec -T server manara-server -seed -seed-email <email>` prints
  a parentSession and an enrollment code. Never print a device token or release secret in output.
- **Restart the app** after the instrumented sync test: `am start -f 0x10008000 -n com.manara.agent/.MainActivity`.
  `am force-stop` is ignored while Manara is device owner ("Ignoring request to force stop protected
  package"). On a debug build, `run-as com.manara.agent kill -9 <pid>` kills it the way Android would.
  Shared preferences edited while the process runs are not seen until it restarts.
- **Pause an app** for a test with `pm disable-user --user 0 <pkg>`, then check `dumpsys package <pkg>`
  says `enabled=3` before rebooting; a reboot right after the command once lost the pause.

## 5. Read the result

- Leave the phone **untouched** after triggering an async effect (lock, push, sync). Your own
  `input tap`/`keyevent` re-wakes it and fakes a failure (CLAUDE.md, "Don't trust your own adb
  interaction timing"). Wait, then read.
- Manara's log tags: `ManaraSyncWorker` ("sync result: ..."), `ManaraSync`, `ManaraRelease`,
  `ManaraSetup`, `ManaraSetupReady`, `ManaraOwner`, `ManaraNotice`, `ManaraPush`, `ManaraEnroll`,
  `ManaraProvision`, `ManaraTimeLimit`, `ManaraLockEnforcer`, `ManaraRestrictions`, `ManaraLocation`,
  `ManaraCallLog`, `ManaraCallNotice`, `ManaraBrowser`, `ManaraBrowserBlock`, `ManaraSiteFilter`,
  `ManaraLiveRules`, `ManaraCollectionStatus`.
- Facts beat logs: owner from `dumpsys device_policy`, notice from `dumpsys activity services
  com.manara.agent | grep isForeground`, a lock from `dumpsys power | grep mWakefulness`, a debug
  build's stored state from `run-as com.manara.agent cat shared_prefs/<file>.xml`.
- Process kills (e.g. a revoked permission) are in the events buffer:
  `$A -s $S logcat -b events -d | grep am_kill`. Crashes: `logcat -b crash -d`.

## 6. Capture logs during a long test

Filter by tag, or the file grows by gigabytes (an unfiltered capture reached 1.5 GB in 13 minutes):

```
$A -s $S logcat -v time -s ManaraSetup ManaraSetupReady ManaraSyncWorker ManaraSync ManaraRelease \
  ManaraOwner ManaraNotice ManaraPush DevicePolicyManager AccountManagerService AndroidRuntime adbd \
  > <scratchpad>/capture.txt
```

Don't run `logcat -c` before you know what you need: it deletes the moment you are looking for.
Guided setup turns wireless debugging off at its end or on failure, which ends the capture; that
is expected, not a crash.

## 7. Report

What ran, on which device and build; each check with its evidence (the log line or dumpsys output);
what was not verified and why; and anything left changed on the device (paused apps, test parents,
DB rows on the local stack).
