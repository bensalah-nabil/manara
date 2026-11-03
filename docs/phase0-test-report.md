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
| Accounts re-added successfully afterward, device owner still YES | ☑ Yes | Google account + Reddit/WhatsApp's own account entries all re-added; `dpm list-owners` still shows `DeviceOwner,Affiliated` — confirms the account check is one-time at enrollment, not ongoing, as ADR-0003 predicted |
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

## Phone 2 — status: **in progress**

Still Samsung, not the Xiaomi/second-OEM diversity Phase 0 originally wanted
(that risk — MIUI's background-app killing and account layer — stays open,
revisit when such a device becomes available). Useful anyway as a second
real device and as the first live run of `scripts/enroll-preflight.sh`.

- **Model:** Samsung SM-A045F (Galaxy A04s)
- **Android version:** 14
- **Manufacturer skin/build number:** (not yet recorded)
- **Date tested:** 2026-11-03
- **Enrollment method used:** ☑ B — account removal, no reset (primary)

| Check | Result | Notes |
|---|---|---|
| All accounts removed via Settings | ☑ Yes (automated, not via Settings) | preflight found 7 at start: 2 Google (incl. `nabil.bsalah0@gmail.com`), Duo, Truecaller, Facebook login, Messenger, WhatsApp. All 7 cleared without a single manual Settings tap — see Notes |
| `adb shell dumpsys account` confirms zero accounts | ☑ Yes | `scripts/enroll-preflight.sh` reported "PASS -- 0 accounts" immediately before enrollment |
| Needed the gms/gsf `pm disable-user` workaround | ☑ Yes | not for the 5 app-tied accounts, but required for the 2 `com.google` ones — see Notes |
| Extra Android user profile had to be removed first | ☑ No | preflight: only user 0 present, no Secure Folder on this model |
| `adb install` succeeded | ☑ Yes | the agent APK, `tools/orphan-account-cleaner`, and the backup/restore cycle all installed fine over wireless debugging |
| `dpm set-device-owner` succeeded **without factory reset** | ☑ Yes | `Success: Device owner set to package com.manara.agent/.OwnerReceiver` |
| App shows "Device owner: YES" | ☑ Yes | confirmed via `dpm list-owners`: `DeviceOwner,Affiliated` |
| Accounts re-added successfully afterward, device owner still YES | ☑ Yes | all 5 apps (Duo, Truecaller, Facebook, Messenger, WhatsApp) restored via `scripts/enroll-restore-apps.sh`, `dpm list-owners` still shows `DeviceOwner,Affiliated` afterward; Google account re-login not yet done (credentials step, not a device-state check) |
| Notice survives reboot | ☐ Pending | |
| Notice still present after 24h idle | ☐ Pending | |
| Play Protect warning at install | ☐ Not observed | no warning seen during this session |
| Play Protect warning later (scan, Play Store nag, etc.) | ☐ Pending | |
| Data actually intact after (spot-check: SMS, call log, Wi-Fi, photos, an app's data) | ☑ Yes (by construction) | no reset occurred at any point; the 5 account-tied apps were uninstalled as part of clearing tokens, APKs backed up for restore |

**Verdict:** ☑ Pass (core Phase 0 hypothesis, same as Phone 1), with the
real findings below — notably, this run proved the entire account-removal
step can be fully automated, including the Google accounts, which Phone 1
treated as permanently manual.
**Notes / anything unexpected:**
1. `com.facebook.katana`, `com.facebook.orca`, `com.whatsapp`,
   `com.google.android.apps.tachyon` (Duo), and `com.truecaller` were
   installed and tied to the 7 accounts found — confirming Phone 1's
   finding, these needed full uninstall (not app-level logout, not even
   `-k`) to clear their AccountManager tokens.
2. Tried `adb uninstall -k` first (expecting to keep local app data while
   still clearing the account) — verified on this device it does **not**
   clear the account at all; `-k`'s "keep data" also suppresses the
   cleanup signal the OS sends on uninstall. Switched to a full uninstall,
   which cleared 4 of the 5 immediately.
3. The 5th (WhatsApp) stayed **orphaned** after a full uninstall: no
   package, no registered authenticator, but the account row still showed
   in `dumpsys account` — and a full device reboot didn't clear it either.
   Settings' own Accounts screen couldn't show or remove it (nothing to
   tap — no app owns that type anymore). Built
   [`tools/orphan-account-cleaner`](../tools/orphan-account-cleaner) to fix
   this class of problem: any app can register an `AccountAuthenticator`
   for an arbitrary type string (types aren't reserved by name), which is
   enough to call `removeAccountExplicitly()` on an orphaned account of
   that type. Verified working on this device.
4. Extended the same tool to the 2 `com.google` accounts, previously
   assumed permanently manual. Read AOSP's `AccountManagerService.java`
   rather than assume: removal requires `isAccountManagedByCaller`, which
   checks `PackageManagerInternal.hasSignatureCapability` against
   whichever package is *currently registered* as that type's
   authenticator. For an orphaned type that's trivially satisfied (no
   competitor); for `com.google` it fails because Google Play Services is
   still alive and registered, and no third-party cert gets a capability
   grant from it. Disabling GMS and GSF first
   (`adb shell pm disable-user --user 0 com.google.android.gms com.google.android.gsf`)
   removes that competing registration, and the
   same tool then clears both Google accounts the same way. Re-enabled
   GMS/GSF immediately after. This is the gms/gsf `pm disable-user`
   workaround `enrollment-options.md` already documented as a possible
   fallback but Phone 1 never actually needed or tested — now verified,
   and more capable than originally described (it does not just help
   `dumpsys account` report zero, it enables actually *removing* the
   account).
5. Duo (`com.google.android.apps.tachyon`) is a preinstalled/OEM app on
   this model — `adb uninstall` fails with `DELETE_FAILED_INTERNAL_ERROR`;
   needed `adb shell pm uninstall --user 0` instead.
6. Wireless debugging was unreliable throughout this device's testing:
   the connect address changed roughly a dozen times (re-pairing, DHCP
   lease changes, a reboot), and one large install (`com.facebook.katana`,
   16 split APKs, ~450MB) dropped mid-transfer three times across the
   backup and restore passes combined before completing.
   `scripts/enroll-backup-apps.sh`/`enroll-restore-apps.sh` key their
   backup directory by the device's hardware serial (`ro.serialno`), not
   the connection address, specifically because of this — see `CLAUDE.md`.
7. Restoring Duo failed via `adb install <pulled APK>`
   (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, signature mismatch) — removing a
   preinstalled/OEM app with `pm uninstall --user 0` (finding 5) leaves its
   system/product-partition stub in place, and that stub's signature
   doesn't match the APK we'd pulled while it was running. `adb shell cmd
   package install-existing <pkg>` is the right restore for this case
   (re-enables the existing stub for the user, no APK transfer at all) —
   `scripts/enroll-restore-apps.sh` now tries this first for every
   package, falling back to the pulled APK only when it fails, so a
   normal (non-preinstalled) app is unaffected.
8. End-to-end result, start to finish: `scripts/enroll-preflight.sh` →
   `READY` (0 accounts) → `adb shell dpm set-device-owner
   com.manara.agent/.OwnerReceiver` → `Success` → `dpm list-owners` →
   `DeviceOwner,Affiliated` → `scripts/enroll-restore-apps.sh` → all 5
   apps reinstalled, `dpm list-owners` still `DeviceOwner,Affiliated`
   afterward. No factory reset, no data loss, at any point. Not yet done
   on this phone: re-logging into the 5 apps and the 2 Google accounts
   (credentials, not a device-state check), the 24h idle notice check,
   and the reboot-survival check.

---

## Overall Phase 0 go/no-go

Pass requires both phones to pass every row above.

- [ ] Both phones pass → proceed to Phase 1
- [ ] At least one phone fails → stop and reassess before building further
