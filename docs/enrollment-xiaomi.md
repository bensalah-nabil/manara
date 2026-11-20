# Setting up a Xiaomi (HyperOS): field notes

The first Xiaomi test, on a tablet in use (2026-11-20). It records each step as it happened,
with the evidence, so Manara can be adapted. Facts marked **seen** were observed on this
device; anything else is marked as a guess.

## The device

| | |
|---|---|
| Model | Redmi Pad 2 4G (2505DRP06G), a tablet, no SIM in use |
| System | HyperOS 2.0 (OS2.0.205.0.VOWMIXM), Android 15 (SDK 35), French |
| State | In use: Google, Google Meet, two Facebook and a Messenger account. No Xiaomi account |
| Users | 0 (main) and **999 "XSpace"**, Xiaomi's cloned-apps space, holding a clone of Messenger |
| Path | Guided setup (the phone already in use), Manara 1.0.36 (direct release) |

## What happened, step by step

1. **Developer options and wireless debugging.** Opened by the owner. Pairing from this PC
   failed once with `protocol fault (couldn't read status message)` and worked on the retry
   with the same code. **Seen.**
2. **The connection dropped** while the tablet was left alone: no wireless-debugging service
   was advertised and the tablet didn't answer on the network. After unlocking it, it was back
   on a new port (39313, then 42505). **Seen.** Probably the screen going off; keeping it on
   the charger with "Rester activé" should avoid it (a guess, not tested).
3. **Installing from the download page is blocked by Google Play Protect.** Opening
   `manara.apk` from Files showed "Appli bloquée pour protéger votre appareil", with no
   "Installer quand même". The file was genuine (SHA-256 `cf5109b5…`, the published 1.0.36).
   The log shows Play Protect's dialog (`PlayProtectDialogsActivity`) and
   `VerifyApps: Waiting for package installation timed out for com.manara.agent`. It gives no
   reason. **Seen.**
4. **Installing over adb (wireless) is refused by HyperOS.** `adb install` failed with
   `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` until "Installer via USB" was on
   (Developer options; it covers wireless adb too, despite its name). With it on, HyperOS showed
   its own confirmation (`com.miui.securitycenter/com.miui.permcenter.install.AdbInstallActivity`).
   It closed and the install was refused again, twice, cause unknown. **Seen.**
5. **What worked:** Play Protect's scanning turned off in the Play Store (profile, Play Protect,
   settings), then `manara.apk` installed from Files (installer
   `com.google.android.packageinstaller`), then scanning back on. **Seen.**
6. **Guided setup stopped at step 4** with "Remove Secure Folder and any other user or profile
   on the phone." The reason is user 999: Android refuses device owner over adb while any second
   user exists (AOSP android15-release, `DevicePolicyManagerService.
   checkDeviceOwnerProvisioningPreConditionLocked` returns `STATUS_NONSYSTEM_USER_EXISTS` when
   `nonTestNonPrecreatedUsersExist()`, which counts every user not marked for testing).
   **Seen**, and read in the source.
7. **The menu is "Applications clonées"**, not "Applications doubles" (Paramètres,
   Applications, Applications clonées; the screen is
   `com.miui.securitycore/com.miui.xspace.ui.activity.XSpaceSettingActivity`). Turning the
   Messenger clone off removed it from user 999. **Seen.**
8. **The empty space stays.** With no app left in it, user 999 "XSpace" still exists, so setup
   still waits. **Seen.** The owner then removed it on the tablet (how exactly is not recorded),
   and the other-user line left setup's message.
9. **The accounts: pausing worked for some.** Setup paused Facebook and Messenger
   (`enabled=3`) and their three accounts stopped counting. It could not pause the apps behind
   Google and Google Meet (`com.google.android.apps.tachyon`), so those two had to be removed in
   Settings. **Seen.** The `hasFeatures not supported` warnings at 16:34:54 came from Manara's own
   `RecountAuthenticatorService`, which answers "unsupported" on purpose while it refreshes the
   count; they were not a Facebook account. Android's own recount after that (16:34:59) logged no failing account;
   under the android15-release source (`CalculateHasIncompatibleAccountsTask`) any visible
   account that can't confirm it allows device owner counts against it, so the paused apps'
   accounts were hidden, as on stock Android and unlike the SM-A045F.
10. **The tablet restarted** (about 16:31; whether the owner or HyperOS did it is not known), and
    **Manara did not start again**: no process, no service, no notice, although it holds
    `RECEIVE_BOOT_COMPLETED` and background running is allowed. The console kept showing the old
    accounts. Most likely HyperOS's Autostart ("Démarrage automatique"), off by default for
    installed apps (a guess: the setting itself was not read). **Seen** (Manara not running).
11. **Reopening Manara did not resume setup**: the owner had to start guided setup again. It then
    went straight through to device owner. **Seen.**
12. **Device owner on HyperOS 2 / Android 15.** `dumpsys device_policy`: Device Owner
    `com.manara.agent/.OwnerReceiver`, type 0. Facebook and Messenger running again with their
    accounts; the managed notice (1001) up as a foreground service; guided setup (1003) waiting
    for Finish. Setup turned wireless debugging off and cleared the paired computers, as designed;
    the owner could turn it on and pair again with Manara as device owner. **Seen.**

13. **"Every account back" never updated.** Google, both Facebook accounts and Messenger were back
    on the tablet (`dumpsys account`), yet the console kept every one as "Not yet", also after a
    reload. After device owner, setup lists accounts through `AccountManager`
    (`AdbSetupDevice.kt`), relying on a device owner seeing every account: stock Android does
    (AOSP android15-release, `AccountManagerService.resolveAccountVisibility` returns VISIBLE for
    `isActiveDeviceOwner`, after any visibility an authenticator stored for the package). So
    either HyperOS changes this, or the reports did not reach the server. Undecided: the server
    answered (`/healthz` 200), and the tablet showed no Manara log line at all, so HyperOS may hide
    installed apps' logs. **Seen** (the stale list).

14. **Finish.** Tapped in the console with the list still stale; "Guided setup finished", the
    tablet "Reporting", Manara 1.0.36, "Keep the rules on" locked by default. **Seen.**
15. **Lock now** from the console locked the tablet at once: push through Google reaches Manara
    on HyperOS. **Seen** (by the owner).
16. **A restart with "Démarrage automatique" on** (and battery "Aucune restriction", Paramètres,
    Applications, Gérer les applications, Manara): Manara came back by itself and the console
    showed the tablet reporting again, without opening Manara. Compare step 10, where it didn't.
    **Seen** (by the owner). Holding the power button opens the AI assistant on HyperOS; power
    and volume up together opens the menu with "Redémarrer".

**Result:** the first Xiaomi set up end to end, from a tablet in use, with no reset. Not tested
yet: a rule with a schedule (bedtime, limits), a day of normal use, and whether Play Protect,
turned back on, ever flags Manara.

## What Manara must adapt

| # | Change | Why |
|---|---|---|
| X1 | **A way to install that a parent can finish.** Cause found: the direct APK declares a notification listener (`CallNotificationListener`, calls inside WhatsApp, Messenger, Telegram and Viber, ADR-0008 source 2). Google blocks any app from an internet-sideloading source (browser, messaging app, file manager) that declares `BIND_NOTIFICATION_LISTENER_SERVICE`, `BIND_ACCESSIBILITY_SERVICE`, `RECEIVE_SMS` or `READ_SMS`, "in select markets" ([Play Protect developer guidance](https://developers.google.com/android/play-protect/warning-dev-guidance), read 2026-11-20). The `play` build has no listener. Options: drop the listener from the direct APK; install without it and let Manara update itself to the full one (untested); appeal (for mistakes, so unlikely); the Play Store | Step 3. Every family installing from the download page would stop here |
| X2 | **The empty cloned-apps space.** Tell the parent it must go, or offer to remove it during guided setup (Manara already has a shell then) once the parent confirms, only if no app is left in it | Steps 6 to 8. Turning the clones off isn't enough |
| X3 | **Wording, by brand.** The phone's message named only Samsung's Secure Folder (fixed in `SetupFlow.kt`, released with the next version). The console's French should say "Applications clonées" | Steps 6 and 7 |
| X4 | **Keep the connection alive:** ask for the charger and "Rester activé" before guided setup on a Xiaomi | Step 2 |
| X5 | **Manara itself can be cloned** (it is listed in "Applications clonées"). A clone in user 999 would be a second, unmanaged Manara: check what it would do, and refuse to run as a non-main user | Seen in the list in step 7 |
| X6 | Test what is left: a scheduled rule (bedtime, limits), a day of use, Play Protect turned back on | Steps 14 to 16 passed |
| X13 | Name the phone by its market name ("Redmi Pad 2", `ro.product.marketname`), not the model code "2505DRP06G" | Step 14 |
| X7 | **Autostart.** Ask for "Démarrage automatique" and "Aucune restriction" (battery) on a Xiaomi before setup, and detect when Manara did not start after a restart (the server already sees a quiet phone) | Step 10. A Xiaomi that restarts would stop enforcing until someone opens Manara. **Guide done 2026-11-20** (enroll.note.xiaomiAutostart); detection still open |
| X8 | **A restart before device owner ends the run**: only the last step (after device owner) resumes, by design (`ReconnectMarker.toKeep`), because earlier steps need the wireless-debugging session a restart cuts. Paused apps stay paused until setup runs again. The console now says this under the step when the phone goes quiet (`setup.quietBefore`), not only in the heading. Open: resuming from the step it stopped at instead of from the start | Step 11 |
| X9 | **Readable account names:** the console showed `com.google.android.apps.tachyon` and `com.facebook.messenger` instead of Google Meet and Messenger. **Done 2026-11-20** (`setup.ts`) | Steps 9 and 12 |
| X11 | **Find why "Every account back" stays "Not yet" on HyperOS.** Have the setup report say how many accounts Manara sees and when it last reported, so the console can tell "not visible" from "not sent" | Step 13 |
| X12 | **A way to read Manara's own state on a phone with no logs:** a diagnostics screen or report (last sync, last error), since HyperOS showed no Manara log line | Step 13 |
| X10 | Brand guide: on HyperOS, Facebook and Messenger only need pausing; Google and Meet need removing (the guide said "unknown") | Step 9. **Done 2026-11-20**: Xiaomi marked tested, accounts "googleRemoved" |
