# ADR-0006: Guided setup pauses apps instead of removing accounts

- Status: Accepted
- Date: 2026-11-08
- Replaces the account handling in [ADR-0003](0003-enrollment-without-factory-reset.md)
  (removing every account, uninstalling apps that hold one).

## Context

Android lets `dpm set-device-owner` run over adb only when it counts no
accounts on the phone. Until now guided setup got there by removing them:
the parent removed Google and Samsung accounts in Settings, and Manara saved
and uninstalled every app that held an account (WhatsApp, Instagram...),
then installed it again. Uninstalling deletes the app's data; signing back in
to everything took a parent a long time. A failed run on the A52 lost apps
and accounts.

Reading what Android actually counts showed a better way. Sources: AOSP
`android14-release` and `android15-release`.

1. `DevicePolicyManagerService.setDeviceOwner`, from adb, asks
   `hasIncompatibleAccountsOnAnyUser()`, which reads a cached map
   (`mHasIncompatibleAccounts`). `CalculateHasIncompatibleAccountsTask`
   fills it from `AccountManager.getAccounts()`, and only at
   `ACTION_BOOT_COMPLETED` and `LOGIN_ACCOUNTS_CHANGED_ACTION`.
2. `AccountManagerService.getAccountsAsUserForPackage` returns only accounts
   whose type has an authenticator registered **right now**
   (`getTypesVisibleToCaller` → `mAuthenticatorCache.getAllServices`).
3. `RegisteredServicesCache.queryIntentServices` doesn't ask for disabled
   components, so a disabled app's authenticator isn't registered.
4. `validateAccountsInternal` deletes an account only when no installed
   package has its authenticator's UID any more
   (`getUidsOfInstalledOrUpdatedPackagesAsUser`). A disabled app is still
   installed, so its accounts stay.

So a disabled app's accounts stay on the phone but stop counting. The cached
count still has to be refreshed, because disabling an app changes no account
and sends no broadcast. Adding and removing an account of Manara's own type
does send `LOGIN_ACCOUNTS_CHANGED_ACTION`.

The same cache explains two older puzzles: the SM-A528B refusing device owner
"for accounts" a moment after its list was empty, and orphaned accounts (no
app behind them) seeming to block. An orphaned account isn't counted once the
count is refreshed.

## Decision

Guided setup no longer uninstalls anything, and only asks the parent to
remove an account when Manara can't pause the app behind it:

1. List accounts with `dumpsys account`, which names each type's app.
2. Pause each app that holds a counted account: `pm disable-user --user 0`.
   That includes Google Play services for Google accounts. Never paused:
   Android itself, Settings, the phone app, Manara, and the keyboard, home,
   SMS and dialer apps in use (`settings get secure default_input_method`,
   `cmd role get-role-holders`), so pausing can't change a default app.
3. Refresh the count: Manara adds then removes one account of its own type
   (`com.manara.agent.setup`, `RecountAuthenticatorService`).
4. Run `dpm set-device-owner`, retrying a few times if Android still answers
   from an old count.
5. Turn every paused app back on with `pm enable`. Its accounts and data are
   as they were, and nothing needs signing back in.

The apps are off for a few seconds. To keep it that short, nothing is paused
while the parent still has an account to remove or another user (Secure
Folder) is on the phone.

What can still need the parent: removing a second user, and removing the
account of an app Android refuses to pause or that is a default app (rare).

### Where pausing isn't enough: Samsung (added after the first phone runs)

Android 14 and 15 check accounts **twice** in `setDeviceOwner`: the cached
count above, then a live `getAccounts()` (`hasAccountsOnAnyUser`), which
only returns `false`. The shell prints that as "Can't set package ... as
device owner". On stock Android both checks skip a paused app's accounts.

On the SM-A045F (Samsung, Android 14) the cached check passed every time
and the live check refused every time: 11 refusals over three runs. In the
cleanest run only the Google account was stored, nothing re-added an
account, Play services was paused, and `dumpsys account` showed no
registered app for it for 13 s. Samsung's framework isn't public, so the
cause is concluded from behaviour: its live check counts every stored
account, paused app or not.

So setup does this:

1. Pause first, as above. Stock Android needs nothing else.
2. If `set-device-owner` refuses twice (`PAUSE_RETRIES`) with every counted
   app paused, conclude that pausing isn't enough on this phone. Turn the
   apps back on and list **every** account for the parent to remove in
   Settings, Accounts. Never pause an app that still holds an account in
   that run, and never uninstall.
3. The console first shows, for each account, how to get back in without a
   remembered password, and asks the parent to confirm. For Google: a
   passkey on the parent's phone (QR code plus fingerprint), the recovery
   phone's SMS code, or a Family Link password reset if the parent created
   the account. For other apps: usually nothing, since they stay installed.
4. The phone's setup notice opens the screens: **Open accounts**
   (`Settings.ACTION_SYNC_SETTINGS`) to remove them, then **Add Google
   account** (`ACTION_ADD_ACCOUNT` limited to `com.google`) at the end.
   Google comes first, because its saved passwords bring the others back.
5. Once nothing is stored, pause the apps that held the removed accounts
   for the last few seconds, set device owner, then turn them back on. They
   hold no account, so even Samsung's live check passes, and while paused
   they can't sign back in by themselves. If an account comes back before
   its app is paused, the apps go back on first: Settings lists an account
   only while its app is on.

What the A045F showed parents gain even so: no app is uninstalled, no app
data is lost, and **Facebook re-created its account by itself** (and stayed
signed in) after its entry was removed in Settings. Only Google needed
signing back in.

A module that copies the accounts' passwords out and puts them back was
considered and rejected. Android lets only the owning app read an
account's secrets (`AccountManagerService.getPassword`), so it would need
root. It would also be credential harvesting, against ADR-0001.

## Safety

- The paused list is recorded before any app is touched, in the flow's state
  and in a file on the phone (`setup-paused.txt`). A failure turns them all
  back on (`Recover`). A run cut off mid-way (the phone restarted, Manara was
  stopped) turns them on at the next pairing.
- If an app still can't be turned back on, the parent's console names it, with
  how to fix it: Settings, Apps, the app, Turn on.
- Old APK copies an earlier version saved before uninstalling are installed
  again at the next pairing, then deleted.

## Verified

- On an Android 14 emulator, 2026-11-08, by hand:
  - An app holding an account, disabled without a recount: refused.
  - Disabled, after the recount: device owner set; turned back on, its account
    and data file intact.
  - An orphaned account (app uninstalled with `-k`), after the recount: device
    owner set.
- `PauseForOwnerTest`, with Manara's own recount and the setup commands, on
  the same emulator: passed.
- `SetupChaosTest`, 5,000 simulated phones: no account deleted, no app left
  off.

- SM-A045F (Samsung, Android 14), 2026-11-08: pausing worked for the cached
  check, not the live one (above). The fallback asked for the accounts; the
  parent removed Google, then signed back in, and Facebook came back by
  itself. The console showed "Guided setup finished".
- SM-A045F again, fresh 1.0.10, 2026-11-08: the parent removed Google and
  both Facebook accounts at 19:21. Manara's recount at 19:21:41 was followed
  by **Facebook re-creating its account at 19:21:43**, and Android refused
  ("Non test-only owner can't be installed with existing accounts"). Setup
  asked for Facebook again; once it was removed a second time, device owner
  was set 4 s later. That second round is why step 5 exists. In
  `SetupChaosTest`, an app that re-creates its account at the recount did
  so 1,340 times over 5,000 runs before step 5, and 0 times after.

Not yet seen on a phone: pausing on stock Android with Google Play services
(Pixel, Motorola...), the notice's two buttons on Samsung, and other makers
([pending-verifications.md](../pending-verifications.md)).

## Consequences

- Stock Android: no data loss and nothing to sign back in to.
- Samsung: no app uninstalled and no data lost, but the accounts are
  removed for a moment; in practice the parent signs back in to Google only.
- Manara declares one account authenticator. It isn't exported, holds no
  account outside the recount, and refuses every account operation.
- `tools/orphan-account-cleaner` and the `enroll-*-apps.sh` scripts are no
  longer part of setup. They stay for the history and for manual use.
