# Pending verifications

Things that can't be confirmed immediately — need elapsed time, a device we
don't have yet, or an event that may or may not happen. Checked off here as
they resolve, not left buried in a chat log. Cross-reference:
[`phase0-test-report.md`](phase0-test-report.md),
[`decisions/0003-enrollment-without-factory-reset.md`](decisions/0003-enrollment-without-factory-reset.md).

| #   | Item                                                                                                                                                                                                                                                                                                                 | Started    | Re-check                                                                                           | How to verify                                                                                                                                                                                                                                | Status                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2   | **Play Protect** warning, at install or any time after (incl. when the Play Store is next opened)                                                                                                                                                                                                                    | 2026-11-02 | Ongoing — no fixed end                                                                             | Watch for any scan dialog/warning; screenshot if one appears                                                                                                                                                                                 | ⏳ Open — none seen across dozens of installs/enrollments through 2026-11-03                                 |
| 3   | **Code fix for POST_NOTIFICATIONS self-grant** — verified the *symptom* fix manually (pm grant + reboot) on the Samsung, but the actual code path (`OwnerReceiver.grantSelfGrantablePermissions`) hasn't been exercised on a fresh enrollment yet, since this phone's admin was already active before the fix landed | 2026-11-02 | Next fresh enrollment (any new phone)                                                              | On a newly-enrolled device, confirm the notice appears **without** running `pm grant` manually                                                                                                                                               | ⏳ Open                                                                                                      |
| 4   | **Second OEM device** (Xiaomi/MIUI or similar) — a second *Samsung* (SM-A045F) was tested 2026-11-03, which doesn't resolve this; still Samsung-only                                                                                                                                                                 | 2026-11-02 | When a non-Samsung device becomes available                                                        | Full account-removal enrollment flow per `agent/README.md`, same checklist as Phone 1                                                                                                                                                        | ⏳ Open — blocked on device availability                                                                     |
| 6   | **The real unattended ~15-minute `WorkManager` timer firing on its own** — resolved everything *except* literally waiting out the OS's own schedule (see Resolved below for what was confirmed instead)                                                                                                              | 2026-11-03 | Low priority — `WorkManager`'s scheduling reliability is Android platform behavior, not agent code | Leave the phone alone 15-20 min with a pending policy change, confirm it applied with zero taps                                                                                                                                              | ⏳ Open, low priority                                                                                        |
| 7   | **24h idle + reboot-survival on Phone 2** (Samsung SM-A045F) — device-owner and app-restore confirmed 2026-11-03; the time-based checks specifically weren't run yet on this phone                                                                                                                                   | 2026-11-03 | Needs elapsed time                                                                                 | Leave the phone idle 24h+, reboot, confirm notice + device-owner status both still present                                                                                                                                                   | ⏳ Open                                                                                                      |
| 8   | **A3 physical power-loss coverage**                                                                                                                                                                                                                                                                                  | 2026-11-04 | Before claiming power-loss durability                                                              | Process death at the state-write/event-insert boundary, rollback, concurrent observers, reopen, and offline replay after a committed transition are verified below. Physical power loss and every possible crash boundary were not injected. | Process-death checks passed; power-loss testing remains open                                                |
| 9   | **A3 proactive parent alerts (E4)**                                                                                                                                                                                                                                                                                  | 2026-11-04 | Remaining E4 work                                                                                  | Implement and verify actual parent notifications separately from reading the events API. Private DNS configuration restriction drift is verified below; other restriction keys/OEMs remain untested for drift.                               | Tamper alerts built; verified on fake devices only (see below). Not-reporting and request alerts still open |

### Manara using the phone's own wireless debugging (SM-A528B, 2026-11-06)

`SelfAdbProbeTest` (opt-in, test build only) paired through Kadb 2.1.5 with the
phone's wireless debugging at its Wi-Fi IP, using a pairing code the parent
typed on the computer, then ran `id`, an account count and `dpm list-owners`:
`uid=2000(shell)`, 13 accounts, Manara as device owner, SDK 34. Its key was
deleted afterwards; the phone keeps a now-useless "Paired devices" entry until
forgotten in Settings. First attempt failed before pairing with
`NoSuchMethodError` in kotlinx-coroutines: on-device tests load shared classes
from the app APK, which had 1.8.1 while Kadb needs 1.11.0; fixed by pinning the
app to 1.11.0.

**Not verified:** `dpm set-device-owner` over this channel, connecting to
`127.0.0.1`, pairing entered from a notification (the real flow), other brands.

### Guided setup's real phone I/O, read-only (SM-A528B, 2026-11-06)

`SelfAdbProbeTest` now drives the app's own `AdbSetupDevice` (commit
`98edd37`), stopping after the read-only steps. With a pairing code and port
typed by the parent it paired, found the phone's own `_adb-tls-connect._tcp`
port through `NsdManager` (no port typed for that), connected as the shell
user, and read the accounts: 13 accounts, all 13 matched to the app that
registered them, 7 held by apps the user installed (these setup would save
and uninstall), 6 left for the parent (Google, Samsung, Duo), no second
user, 126 user-installed apps. Key deleted afterwards.

**Not verified:** anything that changes the phone (saving and uninstalling
apps, `dpm set-device-owner`, reinstalling, turning wireless debugging off),
the notification reply, and reports reaching the server from the service.
These need a phone Manara does not manage. Open question from this run: Duo's
account (`com.google.android.apps.tachyon`) belongs to a preinstalled app
here, so setup leaves it to the parent; whether Settings, Accounts can remove
it is unchecked (phase 0 removed Duo with `pm uninstall --user 0` instead).

### Upgrade from database version 1 and E3 on SM-A528B (2026-11-06)

The A52 (Android 14, One UI 6.1, device owner since 2026-11-02) had not
synced since 11-03. Installing the current build in place exposed a missing
Room migration 1-2 (see roadmap); the fixed build upgraded its version-1
database with no error, synced, and kept device owner and the managed notice.
Usage report on (v8): one report, 2026-11-06, 145 minutes, 13 apps; top three
matched `dumpsys usagestats` (Messenger 37 vs 37:02, Facebook 23 vs 23:42,
WhatsApp 20 vs 20:16); notice and status screen disclosed it. Off (v9): no new
report after two syncs, both disclosures gone, all other sections equal to v7.

**Not verified:** that the cached policy row itself survived the upgrade (the
sync re-delivered the same version, so the status screen cannot tell the two
apart; the migration only adds a table). Since then, `DatabaseUpgradeTest`
builds a database exactly as versions 1, 2 and 3 created it and opens it with
the current code: all three pass on this phone, and each checks that the
cached policy and a queued event survive. `ManaraDatabaseMigrationsTest` (unit,
no device) fails the build if any earlier version has no path to the current
one; a mutation check (dropping 1-2) made it fail. Room schemas are now
exported to `agent/app/schemas/` from version 4 on. The A52 now belongs to the
main parent login.

### E3 per-app minutes on the real Samsung (2026-11-05)

Updated agent installed in place (device owner, Usage Access and the existing
Facebook suspension survived); server rebuilt. Turning the report on (v17)
produced one real `usage_report`: 2026-11-05, 179 minutes, 4 apps. Per app it
matched `dumpsys usagestats` daily `totalTimeUsed` rounded down
(settings 122 vs 2:02:36, launcher 22 vs 22:19, Manara 17 vs 17:47). The managed
notice read "Daily app usage is reported to your parent" and the status screen
"Daily app usage report: sent to your parent". Off (v18): no new report after a
sync, both lines gone, all other sections identical to v16.

**Found on the way:** Usage Access for Manara had been switched to `ignore`
about six hours earlier (cause not established; the phone itself reported it
at 16:12). The parent re-enabled it in Settings. **Not verified:** the
unattended hourly cadence across a whole day, a day boundary, the 30-app cap
on a busy phone, other OEMs.

### E4 tamper alerts (2026-11-05)

The backend now sends a message to the operator's ntfy topic and/or webhook
when a phone newly reports an `enforcement` problem (`missing` or `failed`).
Go tests cover the wording, throttling, the restored-clears-throttle rule,
in-batch handling, both senders (headers, body, auth, non-ASCII title, no URL
or topic in errors) and the sync handler's wiring; a mutation check confirmed
the handler test fails if a re-sent event counted as new. End to end, a second
server instance with a local receiver and a **fake device** produced exactly
the expected alerts (new problem, and a break after a restore; none for a
re-sent event, a throttled repeat, or a heartbeat). The real server container
and the Samsung were not touched.

**Not verified:** a real ntfy server or the ntfy phone app (the receiver was a
local stand-in, so the RFC 2047 title was checked against the ntfy docs and
Go's decoder, not rendered by ntfy); an alert caused by the real Samsung; a
webhook consumer other than the stand-in. **Limits:** the throttle is in
memory (6 hours per device, protection and detail), so a server restart can
repeat an alert; alerts go to one operator-configured destination, not per
parent; "not reporting" and child-request alerts are not built; a report from
a phone that stays silent is still silent. An alert for a batch of old events
is sent when the batch arrives, with the report's own time in the text.

### D1 configured-policy screen (2026-11-04)

The initial build and 37 unit tests passed, including five policy-summary tests. The
updated APK is installed in place on SM-A045F and the foreground managed notice
is active. **Baseline phone verification passed after unlocking:** portrait
screenshots showed the configured policy and readable wrapping, including the
unsupported call-log label. Returning from the enrollment screen without
submitting showed v13 in the original activity. A subsequent real one-time
worker updated the open summary from v13 to v14 without leaving the activity;
the activity identity was unchanged. Identical policy content was republished
as v12, v13, and v14 for these checks; no enforcement settings changed, and the
temporary parent sessions were revoked. The final backend version is v14.

Enabled policy variants, unusually long package names, landscape, and enlarged
font layouts remain visually unverified; formatter variants have unit coverage.
Remaining-time estimates are covered below; actual collection-health,
notification, and parent-console parity work are still outstanding.

### D1 remaining-time estimates (2026-11-04)

All 43 unit tests pass, including shared/overlapping budgets, zero/exhausted
limits, disabled rules, and unavailable versus empty usage. Both debug APKs
build with JDK 17 and in-process Kotlin compilation. Two opt-in device tests
passed on SM-A045F: live usage yielded a synthetic five-minute remainder and
an exhausted decision; denied Usage Access returned unavailable rather than
a full budget. Neither test applies a policy or changes permissions itself.

Portrait screenshots showed `0 min (estimated)` for the existing Facebook
rule and `unavailable` while Usage Access was temporarily denied. The original
AppOps `allow` mode was restored in `finally`. The immediate rapid Home/return
snapshot still showed unavailable; a later capture, with no further navigation,
showed the estimate restored. The visible refresh recovered, but an immediate
refresh on every resume or an exact 30-second deadline was not established.
The managed foreground notice was confirmed active afterward. Policy v14 and
its enforcement settings were not changed for this increment.

Remaining coverage: live usage growth, midnight/timezone transitions, nonzero
and shared-budget screen layouts, landscape, enlarged fonts, and other OEMs.
The display retains enforcement's existing whole-minute daily-bucket accounting;
it does not establish exact calendar-day measurement or actual suspension state.

### D1 collection status (2026-11-04)

Implemented and installed: current usage-read status, location prerequisite
states, and durable last-saved location metadata. The UI is read-only and
refreshes active location status even with no app limits. No continuous
collection or confirmed parent receipt is inferred. Historical timestamps are
UTC; provider sample time and local save time are separate facts, with
invalid/future times rendered unknown.

All 50 unit tests and both debug APK builds passed. On SM-A045F, the combined
device suite executed 15 passing tests: 13 storage/fixture checks plus two
available-usage/read-only-enrollment checks. The two opt-in crash phases and
denied-access mode were skipped, not executed successes. Coverage includes
atomic event/metadata rollback and retry, acceptance/reopen durability,
duplicate-last-event handling, older cached sample times, v3->v4 and chained
v2->v3->v4 migrations preserving policy/events/command acknowledgements/health,
and status reads leaving the enrolled policy, queue, and observation unchanged.

Location remained disabled by policy and device setting as requested. No
permissions or parent policy were changed. The managed foreground notice was
active after reopening, and no location service was listed. On 2026-11-05 the
unlocked phone (policy v14, 2% battery, unplugged) showed the section above the
configured policy in portrait: `Usage data: readable`, `Location: off by
policy`, `Call logs: unsupported`, with no clipping and correct wrapping of the
long call-log line. Logs showed no status or runtime errors.
Enabled-location layouts, landscape, enlarged fonts, and resume/refresh
timing were not checked. The pure refresh condition covers location-only
policy; its 30-second UI timing has not been measured. The new denied-access status path has unit coverage and
an updated opt-in device test, but was not rerun with a permission toggle.

Real callback-to-status location verification remains deliberately pending:
fixture events are isolated from the enrolled database and no location
collection was enabled. This does not complete D1's live-location verification,
richer notification, or parent-console parity work.

### D1 richer managed notice (2026-11-05)

The notice now carries an expandable, counts-only summary of the cached policy
(`NoticeSummary`, four unit tests; 54 pass in total). On the SM-A045F the system
notification dump showed the unchanged title and text, `BigTextStyle`, and
the expanded text `App time limits configured: 1 rule` / `Call logs: not
collected` for policy v14, with the same ongoing foreground flags as before and
no logged errors. Not checked: lock-screen rendering, policy changes arriving
while it is shown, and other OEMs.

Observation: the device Location toggle read `true` on 2026-11-05 after reading
`false` the previous evening. Nothing in these tests changes it; policy
location remains disabled, so no location service ran. This was left as found.

## Resolved

- **A3 Private DNS configuration restriction drift** - 2026-11-04,
  Samsung SM-A045F (Android 14). With only `blockPrivateDnsConfig` temporarily
  enabled through the console API (policy v10), the opt-in device test synced
  the policy, cleared `disallow_config_private_dns` using Device Owner
  privileges, and confirmed it was absent. A real one-time `SyncWorker`
  restored the restriction without a policy-version change. Two further
  workers exercised event upload and healthy reapplication. The parent API
  returned exactly one restriction event, `missing`, ID
  `f3f4988e-77be-4dc8-88d4-93250f00d57a`, timestamp
  `2026-11-04T20:33:21.249436Z`. Both the drift check and a separate baseline
  restoration check passed. Original policy content was restored via the API
  as v11, with an empty applied-restriction set; Private DNS remained
  `opportunistic` with no specifier. Device Owner enrollment and the foreground
  managed notice were confirmed, and the temporary parent session was revoked.
  This is privileged fault injection, not a demonstrated user-accessible bypass,
  and covers one restriction on one OEM. Restriction events use the existing
  in-memory collection path, not `HealthTracker`'s atomic transaction. Repeatable
  prerequisites and commands are in
  [`agent/README.md`](../agent/README.md#opt-in-restriction-drift-test).
- **A3 process death inside the health transaction** - 2026-11-04,
  Samsung SM-A045F (Android 14). Two opt-in phases in
  `HealthTrackerStorageTest` exercise the real `HealthTracker.observe` path
  against one UUID-named test database. A synchronous Room query callback
  asserts that a transaction is active, the new unhealthy state is visible,
  and no event has been inserted, then persists a boundary marker outside
  that database and kills its own process. The next instrumentation process
  verifies the marker and changed PID, the original committed healthy state,
  and an empty event queue. Retrying the observation produces one warning;
  repeating it does not duplicate the event. The deliberate-crash phase
  reported `Process crashed`; the recovery phase passed. The seven routine
  storage checks also passed again (the two opt-in phases are skipped without
  arguments). Fixture database/preferences were cleaned up. No production
  fault hook, policy change, or permission change was added. This covers the
  previously identified state/event boundary, not physical power loss or
  every possible termination point. Repeatable commands are in
  [`agent/README.md`](../agent/README.md#health-storage-regression-tests).
- **A3 atomic health persistence and offline replay** - 2026-11-04,
  Samsung SM-A045F (Android 14, hardware serial `R92TB0RPVPL`).
  `HealthTracker` now commits its observation and event in the same Room
  transaction; there is no intervening preference write or in-memory event
  handoff. Room database v3 adds `health_states` through a non-destructive
  v2-to-v3 migration. Legacy preference values are imported on first use;
  explicit reset rows prevent old preferences from reviving forgotten state.
  Seven isolated instrumentation tests passed: database reopen with the same
  event UUID, forced enqueue failure rolling back state, 12 concurrent
  observers producing one event, acknowledgement without re-creation,
  legacy import/reset, independent enforcer/check keys, and v2 migration
  preserving a queued event. These tests use uniquely named databases and
  preferences under the target context, not the enrolled app's real database.
  The upgraded app retained Device Owner enrollment and policy v9 and
  completed real one-time WorkManager syncs. With only the dev backend tunnel
  removed, revoked Usage Access produced a warning during a failed sync.
  After restoring Usage Access, a debug-process kill changed PID 1528 to
  2268 while still offline. On reconnect, the parent events API returned
  exactly one `missing` event (`ae37fca1-9745-43b7-9c22-30bd3f064c1f`)
  and one `restored` event (`036528b7-ebf2-478e-86bf-b34787c9b6eb`).
  This tests death **after commit**, not an arbitrary mid-transaction kill.
  All 32 unit tests and `assembleDebug` passed. Backend forwarding and Usage
  Access are restored, the managed notice is foreground, and policy/settings
  remain at baseline (v9, Location off, DNS opportunistic). Temporary API
  sessions were revoked. No user app data was cleared.
- **Facebook reinstall + re-login** — 2026-11-02, confirmed clean.
- **Instagram reinstall + re-login** — 2026-11-02, confirmed clean.
- **Uninstall-resistance** — 2026-11-02, confirmed on the Samsung SM-A528B:
  normal uninstall attempt failed while device-owner is active. This is the
  core tamper-resistance claim `enrollment-options.md` makes for the
  Device Owner tier over the weaker Accessibility-based option — now
  actually verified on hardware, not just assumed from the API docs.
- **Managed notice + device-owner status survive extended real-world use**
  — 2026-11-02 through 2026-11-03 (well over 24h), confirmed on the Samsung
  SM-A528B. Not a pure untouched-idle test — the phone was actively
  reinstalled, rebooted, and used throughout Phase 1 testing — arguably a
  stronger check than idle alone (reboots, app reinstalls, and dozens of
  enrollments all happened in that span without device-owner status or the
  notice ever dropping).
- **Device-wide Location toggle is a real, separate failure mode** —
  2026-11-03: `LocationEnforcer` silently produced no fixes with
  `location_mode=0` (Settings → Location off) even though the app's own
  `ACCESS_FINE_LOCATION` permission was correctly self-granted.
  **Correction (2026-11-04):** the earlier claim that no Device Owner API
  can enable Location was wrong. The official Android reference documents
  [`setLocationEnabled`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setLocationEnabled(android.content.ComponentName,%20boolean))
  from API 30. Manara currently reports the toggle state without changing
  it; that API has not been exercised by Manara on hardware.
- **A3 health events, real worker to parent API** - 2026-11-04,
  Samsung SM-A045F (Android 14, Device Owner). Usage Access revoked/restored,
  device Location off/on, and Private DNS drift/recovery all reached
  `GET /console/devices/{deviceId}/events?kind=enforcement` with the expected
  `missing`/`restored` statuses. Repeated checks while Usage Access was
  missing produced one warning. Fixed events being lost after the worker's
  post-sync cached-policy application; they now enter Room before the worker
  ends. Fixed DNS automatic mode retaining `dns.google`: checking the host
  alone missed this, so the health check now requires strict hostname mode
  too. The exact mode-only regression was reproduced before the fix and
  detected on the rebuilt APK; strict DNS was re-applied. Recovery event
  IDs: usage `a960c8da-8359-4523-a58f-d852731c9d2d`, location
  `842552d0-c874-4d92-a459-afaa314f1ac0`, DNS
  `b513e55e-0d10-49a7-88a2-22e9fe0dd1a8`. Baseline policy restored as v9:
  existing Facebook zero-minute rule retained, location/filter disabled,
  restriction flags off. Usage Access restored to allowed; Location toggle
  returned to its original off state. These are sampled health checks,
  not proof of deliberate tampering or immediate parent notification.
- **Full Phase 0 → 1 → 2 chain, end to end against the real backend** —
  2026-11-03, confirmed on the Samsung SM-A528B: real QR-code enrollment
  against the real containerized Go/Postgres backend (not `stub-backend`),
  a policy pushed through the real `/console/*` API, synced to the device,
  and genuinely enforced (`setPackagesSuspended` → Instagram blocked,
  confirmed via `dumpsys package`), then cleanly reverted the same way.
  Single-use enrollment-token rejection on a redundant second attempt was
  also observed live, matching the design rather than being a surprise.
- **`SyncWorker` actually works when dispatched by `WorkManager`** —
  2026-11-03, confirmed on the Samsung SM-A528B via a `OneTimeWorkRequest`
  from a test-harness button (same dispatch mechanism the real periodic
  job uses, immediate instead of waiting ~15 min): three separate runs,
  each confirmed success via a fresh `lastSeen` timestamp server-side.
  Found along the way that `adb shell cmd jobscheduler run -f` does **not**
  reliably invoke a `WorkManager`-backed `CoroutineWorker`'s `doWork()` —
  five forced runs via that command produced zero evidence of entering the
  method (confirmed with a race-free `SharedPreferences` marker, not just
  logcat timing), while the `OneTimeWorkRequest` approach worked every
  time. Not a bug in the agent — a tooling quirk of that specific adb
  command with WorkManager-backed jobs specifically. What's *not* resolved
  by this: the literal unattended 15-minute OS timer firing on its own —
  see the still-open item above. That gap is now Android platform
  scheduling behavior, not agent correctness.
- **Full account-removal enrollment, fully automated, including the Google
  account(s)** — 2026-11-03, Samsung SM-A045F: all 7 accounts (5 app-tied +
  2 Google) removed with zero taps in Settings, `dpm set-device-owner`
  succeeded, all 5 apps restored, device owner intact throughout. Real
  findings along the way, now in `CLAUDE.md` and `docs/enrollment-options.md`:
  `adb uninstall -k` does not clear an app's account token (only a full
  uninstall reliably does); one account can still end up orphaned even
  after a full uninstall and a reboot, fixed by `tools/orphan-account-cleaner`
  (any app can register as an arbitrary account type's authenticator —
  verified from AOSP source, not assumed — which is enough to call
  `removeAccountExplicitly()` when no competing authenticator is
  registered); the same tool clears even `com.google` accounts once
  GMS/GSF are temporarily disabled first, removing their competing
  registration.
- **Full Phase 0 → 1 → 2 chain, end to end, on a second real device with a
  different target app** — 2026-11-03, Samsung SM-A045F: a policy pushed
  through the real `/console/*` API (`dailyMinutes: 0` for
  `com.facebook.katana`), synced to the device, genuinely enforced
  (`setPackagesSuspended` confirmed via `dumpsys package`), and the
  real-world effect verified — launching Facebook shows Android's own
  device-owner block dialog ("Action not authorized..."), not a
  workaround or an app-drawn screen. Same result as the Instagram test on
  Phone 1, different device and different target app.
- **FCM push, live, end to end, zero manual interaction** — 2026-11-03,
  Samsung SM-A045F against a real Firebase project (`manara-abff9`):
  `lock_now` queued via the console API → live push → device woke on its
  own, synced, and actually locked (`dumpsys power`'s `mWakefulness` →
  `Dozing`, confirmed with the device deliberately left untouched) →
  acked → lock event reached `GET /console/.../events`. Fixed three real
  bugs along the way (`pendingCommands` never executed, enforcer events
  never collected, a silently-swallowed `lockNow()` exception) — see
  `CLAUDE.md` and `agent/README.md`'s "Push notifications (FCM)".
