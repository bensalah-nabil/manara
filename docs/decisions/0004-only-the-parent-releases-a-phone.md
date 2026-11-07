# ADR-0004: Only the parent releases a phone

- Status: Accepted
- Date: 2026-11-07

## Context

Until now an enrolled phone accepted any new connection code from its
Enroll screen, which the child can open. A child with a parent account of
their own (sign-up is open) could move their phone out of the real parent's
control. Removing Manara itself is not the risk: while it is device owner,
AOSP refuses to uninstall it, clear its data or force-stop it
(`ProtectedPackages.isPackageStateProtected` / `isPackageDataProtected`,
checked in `ActivityManagerService.forceStopPackage` and
`clearApplicationUserData`, and `DeletePackageHelper` for uninstall).

A parent also needs two legitimate ways out: removing Manara for good, and
moving a set-up phone to another account without redoing guided setup.

## Decision

A phone leaves an account only when that account's parent releases it.

- **Release command** from the console, `release` with `mode`:
  - `remove`: the phone switches every rule off (`Policy(version = 0)`:
    unsuspends apps, restores Private DNS), sends its ack in one last sync,
    then calls `clearDeviceOwnerApp`. AOSP's `clearDeviceOwner` has no
    test-only restriction, and `clearDeviceOwnerLocked` resets user
    restrictions and locked permissions itself. An acked release deletes
    the device server-side.
  - `transfer`: the phone opens a 30-minute window in which it accepts one
    connection code. The current account stays in charge until the new one
    has taken over; then the phone acks, and the old account deletes it.
    An expired window is acked `failed` and nothing changes.
- **Release code** for a phone that can't be reached: an 8-digit
  RFC 6238-style code (HMAC-SHA256, 10-minute steps, ±1 step accepted) from
  a per-phone secret sent at enrollment, or at the next sync for a phone
  enrolled earlier. The phone checks it offline. Five wrong codes lock entry
  for an hour, doubling to 24 hours, so 10^8 codes can't be guessed.
- An enrolled phone with no open window refuses a new code **before**
  calling the server, so the code isn't used up.
- New phones get tamper protection by default: factory reset from Settings,
  safe mode, adding users, and developer options/adb are blocked. The parent
  can switch each off. The debugging block waits while guided setup runs
  (setup works over wireless debugging) and never applies to debug builds.

## Consequences

- The release secret is stored in plain form server-side, since the server
  computes codes from it. A leaked secret frees nothing without the phone.
- If the last `remove` ack doesn't arrive, the phone still lets go and the
  parent removes it from the list by hand. Deleting a phone from the list
  doesn't free it; the console says so.
- Recovery-mode factory reset can't be blocked by a device owner. A phone
  reset that way stops reporting, which the console shows.
