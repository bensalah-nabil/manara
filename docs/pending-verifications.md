# Pending verifications

Things that can't be confirmed immediately — need elapsed time, a device we
don't have yet, or an event that may or may not happen. Checked off here as
they resolve, not left buried in a chat log. Cross-reference:
[`phase0-test-report.md`](phase0-test-report.md),
[`decisions/0003-enrollment-without-factory-reset.md`](decisions/0003-enrollment-without-factory-reset.md).

| # | Item | Started | Re-check | How to verify | Status |
|---|---|---|---|---|---|
| 2 | **Play Protect** warning, at install or any time after (incl. when the Play Store is next opened) | 2026-11-02 | Ongoing — no fixed end | Watch for any scan dialog/warning; screenshot if one appears | ⏳ Open — none seen across dozens of installs/enrollments through 2026-11-03 |
| 3 | **Code fix for POST_NOTIFICATIONS self-grant** — verified the *symptom* fix manually (pm grant + reboot) on the Samsung, but the actual code path (`OwnerReceiver.grantSelfGrantablePermissions`) hasn't been exercised on a fresh enrollment yet, since this phone's admin was already active before the fix landed | 2026-11-02 | Next fresh enrollment (any new phone) | On a newly-enrolled device, confirm the notice appears **without** running `pm grant` manually | ⏳ Open |
| 4 | **Second OEM device** (Xiaomi/MIUI or similar) — Phase 0 is provisionally passed on Samsung alone | 2026-11-02 | When a device becomes available | Full account-removal enrollment flow per `agent/README.md`, same checklist as Phone 1 | ⏳ Open — blocked on device availability |
| 6 | **The real unattended ~15-minute `WorkManager` timer firing on its own** — resolved everything *except* literally waiting out the OS's own schedule (see Resolved below for what was confirmed instead) | 2026-11-03 | Low priority — `WorkManager`'s scheduling reliability is Android platform behavior, not agent code | Leave the phone alone 15-20 min with a pending policy change, confirm it applied with zero taps | ⏳ Open, low priority |

## Resolved

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
  `ACCESS_FINE_LOCATION` permission was correctly self-granted. Unlike
  Usage Access, there is no Device Owner API to force this on — it's a
  genuine user/physical-access-only setting, not a bug. Documented in
  `LocationEnforcer`'s situation as a known fails-closed case, same
  philosophy as Usage Access.
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
