# Pending verifications

Things that can't be confirmed immediately — need elapsed time, a device we
don't have yet, or an event that may or may not happen. Checked off here as
they resolve, not left buried in a chat log. Cross-reference:
[`phase0-test-report.md`](phase0-test-report.md),
[`decisions/0003-enrollment-without-factory-reset.md`](decisions/0003-enrollment-without-factory-reset.md).

| # | Item | Started | Re-check | How to verify | Status |
|---|---|---|---|---|---|
| 1 | Managed notice + device-owner status survive **24h idle** on the Samsung SM-A528B | 2026-11-02 | 2026-11-03 or later | Open the Manara app → "Device owner: YES"; check notification shade for the notice, undismissed | ⏳ Open |
| 2 | **Play Protect** warning, at install or any time after (incl. when the Play Store is next opened) | 2026-11-02 | Ongoing — no fixed end | Watch for any scan dialog/warning; screenshot if one appears | ⏳ Open |
| 3 | **Code fix for POST_NOTIFICATIONS self-grant** — verified the *symptom* fix manually (pm grant + reboot) on the Samsung, but the actual code path (`OwnerReceiver.grantNotificationPermission`) hasn't been exercised on a fresh enrollment yet, since this phone's admin was already active before the fix landed | 2026-11-02 | Next fresh enrollment (any new phone) | On a newly-enrolled device, confirm the notice appears **without** running `pm grant` manually | ⏳ Open |
| 4 | **Second OEM device** (Xiaomi/MIUI or similar) — Phase 0 is provisionally passed on Samsung alone | 2026-11-02 | When a device becomes available | Full account-removal enrollment flow per `agent/README.md`, same checklist as Phone 1 | ⏳ Open — blocked on device availability |
## Resolved

- **Facebook reinstall + re-login** — 2026-11-02, confirmed clean.
- **Instagram reinstall + re-login** — 2026-11-02, confirmed clean.
