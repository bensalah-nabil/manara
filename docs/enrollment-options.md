# Device-owner enrollment: options considered

How to get Manara's agent into Device-Owner (or equivalent) status on a
child's phone was researched properly before Phase 0 testing, because the
obvious path (factory reset) conflicts with the actual product requirement:
works on a phone someone is already using, without losing their data. This
doc records every option considered, with sources, so the reasoning doesn't
have to be redone later. The decision is recorded in
[ADR-0003](decisions/0003-enrollment-without-factory-reset.md); this doc is
the backing research.

## Quick-reference matrix

| Solution | Data loss | Needs reset | Needs ADB/PC | Governs existing apps | Tamper-resistance | Play Store distributable | Confidence |
|---|---|---|---|---|---|---|---|
| **A. Device Owner, factory reset** | Total (unless restored) | Yes | Yes, once | Yes (fresh install) | Highest | No (sideload only) | Verified |
| **B. Device Owner, remove accounts, no reset** | None | **No** | Yes, once | Yes, directly | Highest | No (sideload only) | Verified (AOSP source + real-device reports) |
| **C. Device/Profile Owner on a new secondary user** | None on primary user | No | Yes, once | No — kid starts fresh in new user | Highest (within that user) | No (sideload only) | Verified as a platform feature, not yet tested by us |
| **D. Work Profile (BYOD)** | None | No | No | **No** — separate profile only | Low for the real goal | Yes | Verified, but doesn't solve the problem |
| **E. Accessibility Service + UsageStatsManager + plain Device Admin** | None | No | No | Yes, directly | Medium (user can disable it, but detectably) | **Yes** | Verified, industry-standard approach |
| **F. Factory reset + cloud backup/restore** | Partial — SMS, Wi-Fi, settings don't restore outside the setup-wizard window | Yes | Yes, once | Yes (fresh install) | Highest | No (sideload only) | Verified gap, via Google's own docs |
| **G. Exploit an unpatched vuln to force DO silently** | None | No | Varies | Yes | Highest | No | Rejected — not evaluated further |

## Pros and cons

### A. Device Owner via factory reset
- The textbook enrollment path, simplest to explain, maximum enforcement power.
- Destroys everything on the phone first — only acceptable for a brand-new
  device or one fully backed up and fine being re-set-up from scratch.
- Restore-after-reset is incomplete (see F).

### B. Device Owner via account removal, no reset — **chosen, see ADR-0003**

> Since 2026-11-08 guided setup doesn't remove accounts at all: it pauses the
> apps that hold them for a few seconds, which Android doesn't count, and
> turns them back on
> ([ADR-0006](decisions/0006-pause-apps-instead-of-removing-accounts.md)).
> The backup, uninstall and orphan-cleaner steps below are history.
- Zero data loss: nothing is ever wiped, so there's nothing to restore. SMS,
  call log, Wi-Fi, settings, files, photos, every installed app's data stays
  exactly where it was.
- Same enforcement ceiling as A — identical Device Owner role, reached
  differently.
- Confirmed on a real device (Samsung Galaxy A12, Android 12), not just
  theoretical.
- Still needs USB + ADB + a few terminal commands — not a Play-Store
  tap-through.
- OEM account layers (Samsung account, Mi account) and hidden GMS
  pseudo-accounts can complicate getting to "zero accounts"; temporarily
  `pm disable-user` on `com.google.android.gms` / `com.google.android.gsf`
  was a documented but untested fallback until 2026-11-03 — now verified,
  with a stronger effect than originally described (see the next bullet).
- Any extra Android user profile (guest session, second kid profile) on the
  phone has to be cleared first too (`nonTestNonPrecreatedUsersExist()` check).
- **Account-tied apps can be backed up and removed automatically**
  (`scripts/enroll-backup-apps.sh` / `enroll-restore-apps.sh`) — pulls each
  app's APK(s), fully uninstalls to clear its AccountManager token, and
  reinstalls after enrollment. Real-device finding (SM-A045F, 2026-11-03):
  `-k` (keep data) looked like the safer choice but silently blocks the
  account-cleanup signal — verified it doesn't clear the token at all. A
  full uninstall usually does, but one account (WhatsApp) stayed orphaned
  (app gone, no authenticator registered, account row still present) through
  a full uninstall *and* a reboot, and was invisible to Settings' own
  Accounts UI too. `tools/orphan-account-cleaner` is the fix for that case:
  account-type strings aren't reserved by name, so any app can register
  as a type's `AccountAuthenticator`, but `removeAccountExplicitly()` only
  succeeds if the *caller* has the AUTH signature capability relative to
  whichever package is currently registered for that type (read from
  AOSP's `AccountManagerService.java`, not assumed) — satisfied trivially
  when nothing else is registered (the orphaned case), impossible when a
  live, differently-signed app still is. `com.google` is exactly that
  second case while Google Play Services is installed and enabled — but
  disabling GMS/GSF first (the fallback above) removes the competing
  registration, and the same tool then clears `com.google` accounts too.
  Verified end-to-end on the SM-A045F: 7 accounts (5 app-tied + 2 Google)
  down to 0, entirely without touching Settings, followed by a successful
  `dpm set-device-owner`. Samsung's own account type
  (`com.osp.app.signin`) was never actually present as an account on this
  device (only as a registered authenticator), so it remains untested
  either way — don't assume it behaves like `com.google` without checking.

**Why this works — the actual AOSP precondition**
(`DevicePolicyManagerService.checkDeviceOwnerProvisioningPreConditionLocked`,
read from `android14-release`):

```java
if (isAdb) {
    if (mIsWatch || hasUserSetupCompleted(UserHandle.USER_SYSTEM)) {
        if (nonTestNonPrecreatedUsersExist()) {
            return STATUS_NONSYSTEM_USER_EXISTS;
        }
        ...
        if (hasIncompatibleAccountsOrNonAdb) {   // false the moment accounts == 0
            return STATUS_ACCOUNTS_NOT_EMPTY;
        }
    }
    return STATUS_OK;
}
```

`hasUserSetupCompleted` only gates the *other* two checks — once
`AccountManager.getAccounts()` is empty, both pass regardless of whether the
device finished its setup wizard months ago. The "needs an unprovisioned
device" rule everyone repeats is really just "needs zero accounts right
now" — it only looks setup-wizard-only because a factory reset is the easy
way people reach zero accounts. Device Owner, once set, also persists after
an account is added back afterward — the account check is a one-time gate,
not an ongoing restriction.

**Real-device corroboration**, not just source-reading:
- [freekiosk GitHub issue #68](https://github.com/RushB-fr/freekiosk/issues/68),
  *"\[DOCUMENTATION\] Device owner setup incorrectly requires factory reset"*
  — maintainers had the same wrong assumption, then corrected it.
- [XDA: "How I got device owner without factory reset"](https://xdaforums.com/t/how-i-got-device-owner-without-factory-reset.4745834/)
  — signed out of every account, ran `dpm set-device-owner`, succeeded,
  signed back in. Reported working on a Samsung Galaxy A12, Android 12.
- [Oculess issue #33](https://github.com/basti564/Oculess/issues/33) —
  confirms app-level "sign out" alone is sometimes not enough; accounts must
  be removed at the OS level (Settings → Accounts, or
  `adb shell cmd account remove-account`).

### C. Device/Profile Owner on a freshly-created secondary Android user
- Zero impact on the existing primary user's data — a fully isolated OS-level
  user.
- Same API power as A/B, via Android's documented "dedicated device, multiple
  users" pattern (not a hack): `adb shell pm create-user <name>` (no root)
  creates an empty user that trivially passes the zero-accounts check, then
  the DPC is set as owner on that user id and affiliated with the device
  owner.
- The child doesn't keep using their existing apps/logins — they operate in a
  new, empty user going forward. Real UX discontinuity, not a free lunch.
- Needs OEM support for multi-user mode (not universal, especially on cheaper
  devices).
- Not yet validated end-to-end for Manara — worth a future spike, not Phase 0.

### D. Standard Work Profile (BYOD provisioning)
- Genuinely one-tap, zero ADB, zero reset.
- Structurally doesn't solve the problem: only ever sees apps installed
  *inside* the new work profile, never the kid's existing Instagram/TikTok in
  their personal profile. Ruled out, not pursued further.

### E. No DPC — Accessibility Service + Usage Access + plain Device Admin
- Only option that's simultaneously zero-reset, zero-ADB, and **Play-Store
  shippable** — install, tap through permission screens, done.
- Acts on the real, existing apps directly.
- Google's own Play policy explicitly permits blocking uninstall *for
  parental-control apps specifically* — confirmed by direct quote from
  [the policy page](https://support.google.com/googleplay/android-developer/answer/16585319?hl=en),
  not assumed.
- Materially weaker: a technically motivated teen can disable the
  Accessibility Service from Settings (mitigate by detecting that and
  notifying the parent, not by preventing it outright).
- Means a second implementation of each enforcer (overlay-based blocking vs.
  `setPackagesSuspended`) — real ongoing engineering cost. Candidate for a
  future lower-friction tier, not Phase 0.

### F. Factory reset + cloud backup/restore
- Reuses Android's existing Google backup system — no custom backup
  engineering needed.
- Confirmed gap, from [Google's own support docs](https://support.google.com/android/answer/2819582?hl=en):
  SMS, Wi-Fi passwords, and system settings **only restore during the initial
  setup-wizard sign-in**, not if the account is added later via Settings.
  Since Device Owner enrollment must happen in the account-free window
  *before* that sign-in, this path can't have both the full OOBE restore and
  Device Owner. App data, photos, and contacts still come back fine.
- Kept only as the fallback for devices where B fails (OEM account won't
  fully clear, multi-user check fails, etc.) — not the primary path.

### G. Exploiting an unpatched Android vulnerability to gain Device Owner without consent
- Unreliable by nature — tied to a specific unpatched version, breaks on the
  next security update.
- Contradicts the project's own [ADR-0001](decisions/0001-visible-monitoring-only.md)
  and [`legal-and-ethics.md`](legal-and-ethics.md): silently escalating
  privileges on a device without a visible, consented action is the exact
  stalkerware pattern the whole project exists to avoid, regardless of
  intent. Not pursued.

## Outcome

**B** is primary for Phase 0 — same destination as A (full Device Owner),
strictly better path (no data loss). **F** stays documented as B's fallback.
**E** is a candidate for a future, lower-friction tier for parents unwilling
to touch ADB, accepting weaker tamper-resistance. **C** is a candidate for a
future spike. **D** and **G** are ruled out.
