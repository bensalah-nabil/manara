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
| 5 | **`SyncWorker`'s real ~15-minute periodic trigger** — every enforcement test so far used the manual "Sync now" button or a fresh policy push, never an untouched wait for the actual `WorkManager` schedule to fire on its own | 2026-11-03 | Leave the phone alone for 15-20 min with a pending policy change, no button taps | Check `dumpsys jobscheduler` ran, and that enforcement changed without any manual trigger | ⏳ Open |

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
