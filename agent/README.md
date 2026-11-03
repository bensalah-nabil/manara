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

## Test on an already-in-use phone (no factory reset)

Device owner's actual requirement is **zero accounts present at the moment
the command runs** — not "freshly factory-reset." Removing every account via
Settings satisfies this with zero data loss: nothing on the phone is wiped,
so there is nothing to restore afterward. See
[`../docs/decisions/0003-enrollment-without-factory-reset.md`](../docs/decisions/0003-enrollment-without-factory-reset.md)
and [`../docs/enrollment-options.md`](../docs/enrollment-options.md) for why
this works and what else was considered.

```bash
# 1. On the phone: Settings → Accounts → remove EVERY account listed
#    (Google, Samsung/Mi account, work profile, anything). Must be removed
#    at the OS level (Settings), not just signed out inside an app.
#    Also remove any extra Android user profile (Settings → Multiple users /
#    Guest) if present — a second OS-level user blocks enrollment too.

# 2. Enable Developer options + USB debugging on the phone, plug in USB.
adb devices                     # confirm the phone is listed

# 3. Confirm zero accounts remain (OEM/GMS pseudo-accounts can linger even
#    when Settings shows none) -- scripts/enroll-preflight.sh automates this
#    check plus the extra-user-profile and existing-device-owner checks, and
#    lists exactly which accounts/apps still block enrollment:
../scripts/enroll-preflight.sh <serial>     # serial from `adb devices`
#    If accounts still show after Settings removal, try temporarily disabling
#    the account-creating system packages, then recheck:
adb shell pm disable-user --user 0 com.google.android.gsf
adb shell pm disable-user --user 0 com.google.android.gms
../scripts/enroll-preflight.sh <serial>

# 4. Install the APK
adb install app/build/outputs/apk/debug/app-debug.apk

# 5. Make Manara the device owner
adb shell dpm set-device-owner com.manara.agent/.OwnerReceiver
#   success looks like: "Success: Device owner set to package ..."

# 6. If you disabled gms/gsf in step 3, re-enable them now:
adb shell pm enable com.google.android.gsf
adb shell pm enable com.google.android.gms

# 7. Open the app — it should say "Device owner: YES"
# 8. Sign back into the Google account (and any others) via Settings as
#    normal. Device owner persists — the account check only applies at the
#    moment set-device-owner runs, not afterward.
# 9. Reboot the phone, wait, reopen — notice should still be there,
#    device owner still YES.
```

### Real-world gotchas found during testing (Samsung SM-A528B)

- **Not just Google/Samsung accounts.** `adb shell dumpsys account` can show
  leftover entries registered by ordinary apps (Instagram, Airbnb, Facebook's
  SDK, etc.) — these block enrollment exactly like a Google account does.
  `pm clear` on the app does **not** remove them (accounts live in a central
  AccountManager database, not the app's own data) — you have to fully
  uninstall the app to force its token off, then reinstall and log back in
  afterward.
- **Samsung's Secure Folder counts as a second Android user** and
  independently blocks `set-device-owner`
  (`nonTestNonPrecreatedUsersExist()`) regardless of how clean the accounts
  are. Find it via Settings → search "Secure Folder" → uninstall it. This
  deletes whatever's stored inside that isolated vault specifically —
  nothing outside it.
- **Removing a Samsung account asks for the account password** (Reactivation
  Lock, an anti-theft feature) — not the phone's screen-lock PIN. Turning off
  Find My Mobile's Reactivation Lock first sometimes avoids the re-prompt.

### On credentials: there is nothing to extract or back up

Removing an account via Settings only unlinks this one device — it does not
delete the account or anything synced to it. Signing back in afterward
restores Google/Samsung Password Manager entries, contacts, and any
account-backed app login exactly as before, from the account's own
server-side data, not from anything this project stores. Don't build or run
anything that reads another app's saved password off the device (there's no
supported API for it anyway, short of scraping a password-manager vault) —
if you can't recall a login after account removal, it's in your own password
manager already, not something to recover from this process.

### Account-tied apps can be backed up, removed, and restored automatically

`scripts/enroll-backup-apps.sh <serial>` pulls each account-tied app's APK,
fully uninstalls it (clearing its AccountManager token), and
`scripts/enroll-restore-apps.sh <serial>` reinstalls everything after
enrollment.

If `scripts/enroll-preflight.sh` still shows an account present after its
app is confirmed uninstalled (check via `adb shell pm path <pkg>`) — even
after a reboot — that account is orphaned, not just slow to clear. Use
[`tools/orphan-account-cleaner`](../tools/orphan-account-cleaner) to remove
it directly; see its README for why this is necessary and how it works.
This also covers the Google account(s) — not just third-party ones — once
GMS/GSF are temporarily disabled first (same README); verified end-to-end
on a Samsung SM-A045F, 7-for-7 accounts cleared with no Settings UI step
at all. Samsung's own account type is untested (wasn't present on that
device) — don't assume it behaves the same without checking.

### Fallback: if accounts won't fully clear on this phone

If `dumpsys account` still shows something after step 3's workaround (OEM
account layers can be stubborn), fall back to a factory reset per
`enrollment-options.md`'s option F — but expect it to be lossier: Google's
own restore only brings back SMS, Wi-Fi passwords, and system settings if
the account is signed in *during the setup wizard itself*, which is
incompatible with the account-free window `set-device-owner` needs. App
data, photos, and contacts still come back fine either way.

### Removing it (cleanup)

Device owner can't be uninstalled normally. To remove:

```bash
adb shell dpm remove-active-admin com.manara.agent/.OwnerReceiver
adb uninstall com.manara.agent
```

(If that's blocked, a factory reset always clears it.)

## Push notifications (FCM)

`lock_now` (and anything else `domain.CommandType.IsUrgent()` marks on the
backend) can wake the device immediately via Firebase Cloud Messaging
instead of waiting for the next ~15-minute poll. Fully additive: a build
without the setup below runs exactly as it did before this existed, just
polling-only — see `PushConfig.kt`'s and `app/build.gradle.kts`'s comments
for why there's no `google-services.json`/Google Services Gradle plugin
dependency here.

To actually enable it:

1. Create a Firebase project at console.firebase.google.com (free tier).
2. Add an Android app to it with this project's applicationId
   (`com.manara.agent`).
3. From the project's web API key / app config, add four lines to
   `agent/local.properties` (already gitignored, same file `sdk.dir`
   lives in):
   ```
   FCM_API_KEY=...
   FCM_APP_ID=...
   FCM_PROJECT_ID=...
   FCM_SENDER_ID=...
   ```
4. On the backend side: generate a service account key (Project settings
   → Service accounts → Generate new private key) and point
   `FIREBASE_SERVICE_ACCOUNT` at it — see `backend/README.md`.
5. Rebuild and reinstall the agent. `PushManager.ensureRegistered` runs
   from `OwnerReceiver.onEnabled`, `BootReceiver`, and
   `MainActivity.onCreate` — any of those gets a fresh install/reboot/open
   registered.

Verified end to end on a Samsung SM-A045F against a real Firebase project
(`manara-abff9`), with **zero manual device interaction**: a `lock_now`
command queued via the console API → live FCM push → device fetched and
executed it (`DevicePolicyManager.lockNow()` actually locked the screen,
confirmed via `dumpsys power`'s `mWakefulness` → `Dozing`, device left
completely untouched afterward to rule out any interaction confound) →
acked back → the resulting lock event reached `GET /console/.../events`.

Chasing this to a clean result surfaced and fixed three real, pre-existing
bugs, none push-specific (all were already broken for the existing
poll-only path, just never exercised by a real `lock_now` command before):
`SyncManager` parsed `pendingCommands` from every sync response but never
executed or acked any of them (`LockEnforcer.lockImmediately()` already
existed for exactly this, just was never called); `EnforcerRegistry.collectAllEvents()`
was defined and never called from anywhere, so no enforcer-generated event
(a scheduled lock, a time-limit suspension) ever reached the backend; and
`lockImmediately()` swallowed any exception from `lockNow()` via a bare
`runCatching` with no logging, so a real failure would have looked
identical to success. That last one briefly looked like a genuine
WorkManager-specific failure (command acked, screen never visibly locked)
before turning out to be test methodology: checking wakefulness
immediately after an `adb` tap that itself re-woke the device, not a code
or platform bug — the fix (propagate the real error instead of swallowing
it) still landed, since a silent `runCatching` around a safety-relevant
call is a real defect regardless of what triggered finding it.

## What to record for the Phase 0 report

For each phone (model, Android version):
- [ ] `set-device-owner` succeeded?
- [ ] App shows "Device owner: YES"?
- [ ] Notice survives reboot + 24h idle?
- [ ] Play Protect warning at install or later? (screenshot if so)
