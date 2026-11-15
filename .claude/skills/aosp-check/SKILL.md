---
name: aosp-check
description: Read the Android source before claiming how Android behaves — device owner, admins, accounts, permissions, app ops, package states, force-stop, Settings. Use before writing or explaining code that depends on a platform behaviour, when a device does something unexpected, or when about to say "Android does X". Fetches AOSP files for the right Android version and cites them.
---

# Check Android's source, don't recall it

CLAUDE.md: secondhand claims about `DevicePolicyManager`/AOSP behaviour have been wrong in this
project before. Every platform fact that code or an explanation relies on gets read from the
source (or the official `developer.android.com` reference for public API), and cited.

Recalled facts that the source overturned or sharpened, in one week:

- `unsafeCheckOpNoThrow` "is the modern call": Android 16 deprecates it in favour of `checkOpNoThrow` again.
- "`onEnabled` means Manara is an admin for the first time": Android 14's `setActiveAdmin` sends it
  again for an admin that already exists.
- "A refused `set-device-owner` leaves nothing behind": the admin removal stays pending until Manara
  handles `DEVICE_ADMIN_DISABLED`, and the next try fails with "being removed".

## 1. Pick the version

The branch must match the phones: `adb -s <serial> shell getprop ro.build.version.release`.
Branches that exist: `android14-release`, `android15-release`, `android16-release`. When the
behaviour may differ between versions (`minSdk` is 30), read each version the phones run.

## 2. Fetch the file

```
B=android14-release
P=services/devicepolicy/java/com/android/server/devicepolicy/DevicePolicyManagerService.java
curl -s "https://android.googlesource.com/platform/frameworks/base/+/refs/heads/$B/$P?format=TEXT" \
  | base64 -d > <scratchpad>/dpms_$B.java
grep -n "public boolean setDeviceOwner(" <scratchpad>/dpms_$B.java
```

Save into the scratchpad, then read the method and what it calls with `sed -n 'a,bp'`. Files used so
far (all present on the three branches):

| Question | File under `frameworks/base` |
|---|---|
| Device owner, admins, accounts check, policies | `services/devicepolicy/java/com/android/server/devicepolicy/DevicePolicyManagerService.java` |
| What `dpm set-device-owner` prints and undoes | `services/devicepolicy/java/com/android/server/devicepolicy/DevicePolicyManagerServiceShellCommand.java` |
| Public DPM API and its docs | `core/java/android/app/admin/DevicePolicyManager.java` |
| App ops (usage access) | `core/java/android/app/AppOpsManager.java` |
| Granting/revoking permissions, kills on revoke | `services/core/java/com/android/server/pm/permission/PermissionManagerServiceImpl.java` |
| Accounts, visibility, `LOGIN_ACCOUNTS_CHANGED` | `services/core/java/com/android/server/accounts/AccountManagerService.java` |
| Force-stop, process kills | `services/core/java/com/android/server/am/ActivityManagerService.java` |
| `pm disable-user`, `pm enable` output | `services/core/java/com/android/server/pm/PackageManagerShellCommand.java` |
| Settings keys, which are readable | `core/java/android/provider/Settings.java` |

Don't know the file? Search the method name in the AOSP code search (cs.android.com) or grep a file
already fetched for the class it delegates to.

## 3. Read it properly

- Follow the call through: a public method usually delegates (`setActiveAdmin` → `checkActiveAdminPrecondition`).
- Note the conditions and the order (what happens before the check that refuses, what is undone after).
- Look for `@hide`, `@SystemApi`, `@Deprecated`, `@FlaggedApi`, and `if (... SDK_INT ...)` gates.
- Samsung and other makers change this code (Knox's `EnterpriseDeviceManagerService`, account
  counting). AOSP tells you what stock Android does; confirm a maker's behaviour on that phone
  (the `device-verify` skill) and say which one you are claiming.

## 4. Cite it

In code comments, commit messages and answers, name the branch, file and method, e.g.
"AOSP android14-release, DevicePolicyManagerService.setActiveAdmin: sends DEVICE_ADMIN_ENABLED even
when refreshing an existing admin". If the fact matters to a decision, add it to the relevant ADR in
`docs/decisions/` or a lesson in CLAUDE.md. Say plainly when something is inferred rather than read.
