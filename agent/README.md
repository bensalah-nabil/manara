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

Requires JDK 17 (tested) and the Android SDK command-line tools. With `ANDROID_HOME`
set:

```bash
cd agent
./gradlew assembleDebug
# output: app/build/outputs/apk/direct/debug/app-direct-debug.apk
```

First run downloads the Gradle wrapper and Android dependencies, so it needs
network and a few minutes.

The current Kotlin/KSP tooling rejected Java 25 in testing. Set `JAVA_HOME` to
JDK 17; if an old Kotlin daemon is still being reused, add
`-Pkotlin.compiler.execution.strategy=in-process` to the Gradle command.

### Configured policy summary

The main screen shows the cached policy ahead of the existing debug harnesses:
app budgets and package names, scheduled locks, requested restrictions, and
collection settings. It observes Room updates while the activity is started,
including policies received by background sync. It never applies or edits
policy itself. "Requested" does not mean a protection or collection service
is confirmed working; unsupported call logging is labelled explicitly.

This D1 screen now also shows estimated daily time left for each configured app.
It shares the usage reader and remaining-budget calculation with enforcement:
packages in one rule share its budget, overlapping rules use the smallest
remaining allowance, and exhausted budgets show zero. Missing Usage Access or
unreadable usage shows "unavailable", not a full allowance. Reads run off the
main thread when the activity starts, when policy changes, and every 30 seconds
while started; stopping the activity cancels the refresh. A rapid return that
does not stop the activity can retain the prior value until the next refresh.

These are whole-minute estimates, not an exact countdown or proof an app is
currently blocked. The existing `INTERVAL_DAILY` accounting is unchanged;
Android's [queryUsageStats reference](https://developer.android.com/reference/android/app/usage/UsageStatsManager#queryUsageStats(int,%20long,%20long))
notes that query boundaries can expand to whole interval buckets. Collection
status is described below; richer managed-notice content remains separate D1 work.

Build and all 43 unit tests pass. On the Samsung SM-A045F, the baseline portrait
screen and text wrapping were inspected, returning to the activity showed v13,
and a real worker updated the open summary from v13 to v14 without reopening
the activity. The remaining-time increment kept v14 unchanged and verified both
zero remaining and unavailable screens, followed by recovery after Usage Access
was restored. Two opt-in device tests passed using live usage and synthetic
budgets without applying a test policy. See
[`pending-verifications.md`](../docs/pending-verifications.md).

After building/installing both debug APKs as below, run the reader checks with:

```bash
adb -s <serial> shell am instrument -w -r -e dailyUsageMode available -e class com.manara.agent.enforcers.DailyUsageReaderDeviceTest#availableUsageFeedsRemainingBudgetWithoutApplyingPolicy com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
adb -s <serial> shell am instrument -w -r -e dailyUsageMode unavailable -e class com.manara.agent.enforcers.DailyUsageReaderDeviceTest#deniedUsageIsUnavailableRatherThanUnusedBudget com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
```

The first check requires Usage Access and a recorded Manara usage entry (open
the app first). The second requires Usage Access to be denied deliberately;
record the original AppOps mode and restore it in `finally` after that check.
Neither test changes permissions or policy itself. Instrumentation restarts
the target process; reopen Manara afterward to restore the visible notice.

### Collection status

The read-only collection section distinguishes usage data that was actually
read from missing Usage Access or unavailable data. For location it shows
policy-off, observed prerequisite blockers, or available prerequisites without
claiming collection is running. Historical evidence contains only the last
locally saved event identity and its sample/save timestamps, not coordinates
or an upload receipt. Disabled location does not trigger location reads from
this status section. Active location status refreshes even without app limits.

`LocationNoticeService.recordFix` now saves its event and observation metadata
in one Room transaction. The one-row observation survives event acceptance and
restart; failures roll back both writes. Provider sample time and local save
time stay distinct, including cached or out-of-order samples. Android's
[Location.getTime reference](https://developer.android.com/reference/android/location/Location#getTime())
notes that provider/device wall clocks may differ or jump. Times are displayed
as UTC timestamps, with invalid/future values marked unknown; no freshness or
continuous-collection guarantee is inferred.

Room v4 adds this metadata without rewriting existing records. Both v3->v4 and
v2->v3->v4 preservation paths are tested; existing history is not backfilled.
All 50 unit tests and both APK builds pass. On SM-A045F, 13 storage/fixture
tests plus two available-usage/read-only-enrollment tests passed; two crash
phases and the denied-access mode were skipped in that run. Location policy
and the device toggle stayed disabled, no permissions were changed, and the
managed notice was confirmed active after reopening. The updated APK is
installed, and the portrait screen was inspected on 2026-11-05: the section
renders above the configured policy, unclipped, showing usage readable,
location off by policy, and call logs unsupported. Real location callbacks
remain deliberately unverified in this increment.

With location disabled by policy and in device settings, and Usage Access
already granted, run the combined read-only checks after installing both APKs:

```bash
adb -s <serial> shell am instrument -w -r -e dailyUsageMode available -e class com.manara.agent.enforcers.HealthTrackerStorageTest,com.manara.agent.enforcers.DailyUsageReaderDeviceTest com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
```

The runner reports 18 cases, of which 15 execute and three are assumption-skipped.
Fixture location events never enter the enrolled database or start a service.
Reopen Manara after instrumentation and check the managed notice.

### Health storage regression tests

Pure decisions run with `./gradlew testDirectDebugUnitTest`. The Room transaction
tests need an Android device. They create and delete only UUID-named test
databases/preferences, without changing the enrolled policy or permissions.
For an enrolled debug device, update in place and invoke instrumentation
explicitly (use `gradlew.bat` on Windows and replace `<serial>`):

```bash
./gradlew assembleDirectDebug assembleDirectDebugAndroidTest
adb -s <serial> install -r app/build/outputs/apk/direct/debug/app-direct-debug.apk
adb -s <serial> install -r app/build/outputs/apk/androidTest/direct/debug/app-direct-debug-androidTest.apk
adb -s <serial> shell am instrument -w -e class com.manara.agent.enforcers.HealthTrackerStorageTest com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
```

The thirteen routine checks run normally; two process-death phases are skipped
unless explicitly selected. To test the state-write/event-insert crash
boundary, run both phases with the same fresh UUID. This deliberately kills
the target debug process, briefly interrupting the managed notice; reopen
the activity afterward. It does not touch the enrolled database. In
PowerShell, after installing the test APK above:

```powershell
$device = '<serial>'
$crashId = [Guid]::NewGuid().ToString()
$testClass = 'com.manara.agent.enforcers.HealthTrackerStorageTest'
$runner = 'com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner'
try {
   adb -s $device shell am instrument -w -e class "$testClass#terminateBetweenStateAndEventInsert" -e healthCrashId $crashId -e healthCrashMode kill $runner
   adb -s $device shell am instrument -w -e class "$testClass#interruptedTransitionRollsBackAndCanRetry" -e healthCrashId $crashId -e healthCrashMode verify $runner
} finally {
   adb -s $device shell am start -n com.manara.agent/.MainActivity
}
```

The first phase must report `Process crashed`; that alone is not a pass.
The second must report `OK (1 test)`: it verifies the crash boundary marker,
rollback, and exactly one event on retry, then removes its test fixtures.
Never run the full class with crash arguments; select the exact methods above.
This verifies process death, not physical power loss.

The app database upgrades from v2 to v3 by adding health state alongside the
existing policy, event, and acknowledgement tables. Health observations and
events commit together; legacy preference values are read only until a Room
state row exists. Destructive migration fallback is removed. A v1 database
does **not** have a supported migration path yet: do not clear data to work
around this; add and verify a preserving migration before upgrading one.

### Opt-in restriction drift test

`RestrictionsEnforcerDeviceTest` is separate from the isolated storage tests:
it uses the enrolled database, real backend, and Device Owner privileges on
an Android 10+ debug test device. Both methods skip without explicit arguments.
Real syncs can upload queued events and execute pending commands; use a
controlled test device with no pending commands or concurrent policy edits.

1. Preserve the complete original backend policy. Through the console API,
   enable only `restrictions.blockPrivateDnsConfig`, retaining all other fields.
2. Install the test APK in place as above and ensure the backend is reachable
   from the phone (for local development, `adb -s <serial> reverse tcp:8080 tcp:8080`).
3. Run the selected test, recording a start time for the parent API query:

```powershell
$device = '<serial>'
adb -s $device shell am instrument -w -e class 'com.manara.agent.enforcers.RestrictionsEnforcerDeviceTest#removedPrivateDnsRestrictionIsReappliedByWorker' -e restrictionDriftMode private_dns com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
```

The test syncs the enabled policy, clears the Private DNS configuration
restriction, verifies its absence, and awaits a real worker's reapplication
without a policy-version change. Two more workers upload the event and
exercise healthy reapplication. Its `finally` restores the restriction to
the currently cached policy, **not the original backend policy**. Query the
parent events API since the recorded start time and require exactly one
`enforcement` event with `enforcer=restrictions`, `status=missing`, and
`detail=disallow_config_private_dns`. Instrumentation success alone does not
prove API delivery or absence of duplicates.

Always restore the original backend policy via the API in host-side `finally`,
including on test failure, then sync it to the phone. For an originally disabled
restriction, verify restoration with the following command; use `true` instead
if it was originally enabled:

```powershell
adb -s $device shell am instrument -w -e class 'com.manara.agent.enforcers.RestrictionsEnforcerDeviceTest#syncConfiguredPolicy' -e restrictionDriftMode sync -e expectedPrivateDnsRestriction false com.manara.agent.test/androidx.test.runner.AndroidJUnitRunner
adb -s $device shell am start -n com.manara.agent/.MainActivity
```

Confirm the visible managed notice afterward. This is privileged fault
injection, not evidence that a child can remove Device Owner restrictions.
Verified on SM-A045F/Android 14; other restriction keys and OEMs are not covered.

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
adb install app/build/outputs/apk/direct/debug/app-direct-debug.apk

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
