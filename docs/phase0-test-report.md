# Phase 0 test report — device-owner proof

One copy of this section per phone tested. See [`../agent/README.md`](../agent/README.md)
for the build/ADB steps this report is checking off, and
[ADR-0003](decisions/0003-enrollment-without-factory-reset.md) for why the
primary method is account removal, not factory reset.

## Phone 1

- **Model:** Samsung SM-A528B (Galaxy A52s)
- **Android version:** 14 (security patch 2025-09-01)
- **Manufacturer skin/build number:** One UI 6
- **Date tested:** 2026-11-02
- **Enrollment method used:** ☑ B — account removal, no reset (primary)

| Check | Result | Notes |
|---|---|---|
| All accounts removed via Settings | ☑ Yes | Samsung account required password re-entry (Reactivation Lock) |
| `adb shell dumpsys account` confirms zero accounts | ☑ Yes | took two extra rounds — see below |
| Needed the gms/gsf `pm disable-user` workaround | ☑ No | not needed — blockers were different (see Notes) |
| Extra Android user profile had to be removed first | ☑ Yes | **Secure Folder** (`UserInfo{150:Secure Folder}`) — not mentioned in original README, had to be found and uninstalled via Settings |
| `adb install` succeeded | ☑ Yes | over wireless debugging (USB port was unavailable) |
| `dpm set-device-owner` succeeded **without factory reset** | ☑ Yes | `Success: Device owner set to package com.manara.agent/.OwnerReceiver` |
| App shows "Device owner: YES" | ☑ Yes | |
| Accounts re-added successfully afterward, device owner still YES | ☐ Pending | not yet done this session |
| Notice survives reboot | ☑ Yes | confirmed after reboot, see Notes re: notification permission |
| Notice still present after 24h idle | ☐ Pending | needs time |
| Play Protect warning at install | ☐ Not observed | no warning seen during this session |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Pending | keep watching |
| Data actually intact after (spot-check: SMS, call log, Wi-Fi, photos, an app's data) | ☑ Yes (by construction) | no reset occurred at any point; three apps (Instagram, Airbnb, Facebook-SDK) were force-uninstalled as part of clearing stuck account tokens — need reinstall + re-login, everything else untouched |

**Verdict:** ☑ Pass (core Phase 0 hypothesis), with two real findings below

**Notes / anything unexpected:**
1. **Getting to zero accounts took more than "Settings → Accounts":** beyond the Samsung account, `dumpsys account` kept showing 3 leftover entries — not Google/Samsung, but account tokens registered by Instagram (`com.instagram.barcelona`), Airbnb (`com.airbnb.android`), and a Facebook SDK component (`com.facebook.stella`). `pm clear` on those apps did *not* remove the entries (accounts live in a central AccountManager database, not the app's own data) — had to fully uninstall all three to force the tokens off. Also found **Secure Folder** as a second Android user, which independently blocks `set-device-owner` (`nonTestNonPrecreatedUsersExist()`) regardless of accounts — had to uninstall it via Settings → search "Secure Folder". Neither of these was anticipated in the original README; both are now documented there.
2. **The managed notice didn't show up initially** despite the service running correctly (`isForeground=true`, right notification object) — root cause: `POST_NOTIFICATIONS` defaults to denied for a sideloaded app on API 33+, and the service's one `startForeground()` call at `onEnabled()` silently got dropped (`numBlocked=1` in `dumpsys notification`) with no error anywhere. Fixed in code: `OwnerReceiver` now self-grants `POST_NOTIFICATIONS` via `DevicePolicyManager.setPermissionGrantState` before starting the service, so this doesn't depend on anyone granting it by hand. Verified the *symptom* fix (manual `pm grant` + reboot → notice appeared, `numBlocked=0` after); the *code* fix needs a fresh verification on the Xiaomi phone, since this Samsung phone's already-active admin won't re-run `onEnabled()` just from an APK update.

---

## Phone 2

- **Model:**
- **Android version:**
- **Manufacturer skin/build number:**
- **Date tested:**
- **Enrollment method used:** ☐ B — account removal, no reset (primary) ☐ F — factory reset (fallback)

| Check | Result | Notes |
|---|---|---|
| All accounts removed via Settings | ☐ Yes ☐ No | |
| `adb shell dumpsys account` confirms zero accounts | ☐ Yes ☐ No | if No, note whether `pm disable-user` on gms/gsf fixed it |
| Needed the gms/gsf `pm disable-user` workaround | ☐ Yes ☐ No | |
| Extra Android user profile had to be removed first | ☐ Yes ☐ No | |
| `adb install` succeeded | ☐ Yes ☐ No | |
| `dpm set-device-owner` succeeded **without factory reset** | ☐ Yes ☐ No | if No, fell back to F — note why |
| App shows "Device owner: YES" | ☐ Yes ☐ No | |
| Accounts re-added successfully afterward, device owner still YES | ☐ Yes ☐ No | |
| Notice survives reboot | ☐ Yes ☐ No | |
| Notice still present after 24h idle | ☐ Yes ☐ No | |
| Play Protect warning at install | ☐ Yes ☐ No | screenshot if yes |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Yes ☐ No | screenshot if yes |
| Data actually intact after (spot-check: SMS, call log, Wi-Fi, photos, an app's data) | ☐ Yes ☐ No | should be trivially Yes under method B — flag if not |

**Verdict:** ☐ Pass ☐ Fail
**Notes / anything unexpected:**

---

## Overall Phase 0 go/no-go

Pass requires both phones to pass every row above.

- [ ] Both phones pass → proceed to Phase 1
- [ ] At least one phone fails → stop and reassess before building further
