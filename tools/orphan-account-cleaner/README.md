# Orphan Account Cleaner

**Dev tool, not product code.** Not part of the Manara agent or its device
policies -- uninstall it after use. Exists for exactly one problem: an
account whose owning app was fully uninstalled can still leave a stale row
in `AccountManager` that neither `adb` nor Settings' own Accounts UI can
remove, which blocks [ADR-0003](../../docs/decisions/0003-enrollment-without-factory-reset.md)'s
account-removal enrollment path. See
[`../../docs/enrollment-options.md`](../../docs/enrollment-options.md) for
how this was found (real-device testing on a Samsung SM-A045F -- `-k`
uninstall doesn't clear the token, a full uninstall usually does but not
always, and a reboot didn't fix the one that didn't).

## How it works

Account-type strings aren't reserved by name; any installed app can
declare an `AccountAuthenticator` for an arbitrary type. What actually
gates `removeAccountExplicitly()` -- read from AOSP's
`AccountManagerService.java` (`isAccountManagedByCaller` ->
`getTypesForCaller` -> `PackageManagerInternal.hasSignatureCapability`) --
is whether the *caller's* signing certificate has AUTH capability granted
by whichever package is currently registered as that type's authenticator.

- If **no authenticator is currently registered** for a type (the orphaned
  case this tool was built for: the owning app was uninstalled but its
  account row survived), this app registering itself satisfies that check
  trivially -- self-capability, no competing registration to clear.
- If one **is** still registered (`com.google`, served by Google Play
  Services) the check fails for an arbitrary dev-signed APK, unless that
  competing registration is removed first: `adb shell pm disable-user
  --user 0 com.google.android.gms com.google.android.gsf` disables GMS/GSF,
  which un-registers their authenticator, after which this app's
  self-registration for `com.google` works the same way. Re-enable them
  (`pm enable ...`) once done.

It never adds, authenticates, or stores anything -- only removes accounts
of the six types declared in `MainActivity.kt`'s `knownTypes`.

## Use

```
cd tools/orphan-account-cleaner
./gradlew.bat assembleDebug
adb -s <serial> install app/build/outputs/apk/debug/app-debug.apk
adb -s <serial> shell am start -n com.manara.tools.orphanaccountcleaner/.MainActivity
```

Tap "Remove orphaned accounts". Re-run
[`../../scripts/enroll-preflight.sh`](../../scripts/enroll-preflight.sh) to
confirm, then uninstall this app:

```
adb -s <serial> uninstall com.manara.tools.orphanaccountcleaner
```

If an account type recurs that isn't in `knownTypes` in `MainActivity.kt`,
add it there and a matching `<service>` + `res/xml/authenticator_*.xml`
pair in the manifest (see the comment there for why one authenticator
can't cover multiple types).
