# ADR-0003: Device-owner enrollment via account removal, not factory reset

- Status: Accepted. Its account handling (remove every account, uninstall
  apps that hold one) is replaced by
  [ADR-0006](0006-pause-apps-instead-of-removing-accounts.md): apps are paused,
  nothing is removed.
- Date: 2026-11-02

## Context

Phase 0 originally planned to enroll Manara's agent as Device Owner via a
factory reset, per the standard MDM playbook. That destroys everything on
the phone first — in direct conflict with the actual product requirement:
work on a phone a parent or child may already be using, without losing
their data. Several alternatives were researched (work profiles,
Accessibility-Service-only enforcement, a secondary Android user, cloud
backup/restore around the reset) — full comparison in
[`enrollment-options.md`](../enrollment-options.md).

## Decision

Enroll Device Owner by removing every account from the phone (Settings →
Accounts, confirmed empty via `adb shell dumpsys account`), then running
`adb shell dpm set-device-owner`, then adding accounts back. No factory
reset.

This is sound, not a trick: read directly from AOSP's
`DevicePolicyManagerService.checkDeviceOwnerProvisioningPreConditionLocked`,
the "device must be unprovisioned" rule is actually "must have zero accounts
at the moment the command runs" — `hasUserSetupCompleted` doesn't block
enrollment once accounts are empty, regardless of how long the phone's been
in use. Device Owner persists after accounts are added back afterward.
Corroborated by real-device reports (not just source-reading), including a
successful no-reset enrollment on a Samsung Galaxy A12. See
`enrollment-options.md` for sources.

## Consequences

- Phase 0's test procedure (`agent/README.md`) and exit criterion
  (`roadmap.md`) are rewritten around this method instead of factory reset.
- Still requires USB + ADB + a few terminal commands — not a Play-Store
  tap-through install. A lower-friction, weaker-enforcement tier
  (Accessibility Service + Usage Access, no DPC at all) remains an option
  for later, documented in `enrollment-options.md` as option E, not built now.
- Factory reset + Google's own cloud backup/restore is kept as the
  documented fallback for a phone where account removal can't be driven to
  zero (OEM account layers, lingering GMS pseudo-accounts, extra user
  profiles) — with the known caveat that SMS, Wi-Fi passwords, and system
  settings don't restore outside the initial setup-wizard sign-in, so the
  fallback is more lossy than the primary method.
- Phase 0 must specifically test whether Samsung's and Xiaomi's own account
  layers (Samsung account, Mi account) and GMS pseudo-accounts fully clear
  via Settings, or need the `pm disable-user` fallback — this is new
  OEM-specific risk the original factory-reset plan didn't have to
  characterize, since a reset just removes everything regardless.
