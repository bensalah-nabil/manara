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

Not yet seen on a real phone: pausing Google Play services and Samsung's
account app, and a whole guided setup run this way
([pending-verifications.md](../pending-verifications.md)).

## Consequences

- No data loss and no sign-in after setup in the common case. The "sign back
  in" step remains only for accounts the parent removed themselves.
- Manara declares one account authenticator. It isn't exported, holds no
  account outside the recount, and refuses every account operation.
- `tools/orphan-account-cleaner` and the `enroll-*-apps.sh` scripts are no
  longer part of setup. They stay for the history and for manual use.
