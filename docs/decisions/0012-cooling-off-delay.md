# ADR-0012: A cooling-off delay before loosening a phone's rules

Date: 2026-11-20. Status: accepted.

## Context

The owner manages their own phone with Manara too, and asked for a way to make turning off the
adult-site filter hard in a weak moment. Whoever holds the console can change any rule at
once, so a filter is only as strong as the person's resolve at that minute. An urge passes in
minutes; a rule that takes a day to come off holds through it. For a parent, the same delay
stops a child who learned the parent's password from loosening rules unseen.

## Decision

- **A per-phone setting**, `changeDelay.hours` in the policy: Off (the default), 1 hour, 24 hours,
  48 hours or 7 days. The phone ignores it: the server and console use it.
- **The server decides what loosens** (`domain.Loosens`): the website filter off or blocking
  less, Chrome's protections lowered, a site unblocked, a time limit removed or raised, an app
  or games taken out of a limit, fewer bedtime hours, more apps open at bedtime, a setting
  unlocked, a shorter wait, and releasing the phone. Turning off what the phone shares with the
  parent (location, calls, usage report) is not about the phone's use, so it doesn't wait.
- **A loosening waits; everything else applies at once.** The whole saved document waits (a save
  that both tightens and loosens waits too; save the tightening alone to apply it now). The
  console shows a banner with the time left and a Cancel button. A new loosening replaces the
  waiting one and restarts the wait. A tightening applied meanwhile drops the waiting change and
  says so, because the waiting document, applied later, would undo it.
- **Shortening the wait is itself a loosening**, measured against the wait in force now.
- **Release waits too**, and the offline release code is refused (`release_waits`) until a
  release has waited its time; then it is shown for a week, for a phone with no connection.
- Enforced on the server: a modified console can't skip it. A one-minute sweep delivers due
  changes, and runs at start, since the free Render server sleeps.

## Rejected

- *A delay enforced in the console only:* any request to the API would skip it.
- *Splitting a mixed save into its tightening and loosening parts:* per-field merging is easy to
  get wrong in a way that loosens something silently.
- *Waiting on location, calls and usage report:* they control what the parent sees, not what
  the phone can do.

## Limits

- Someone who controls the console can still wait the delay out. A trusted person who is told
  of each loosening (proposed next) covers a change planned in advance.
- A reset through the phone's recovery mode still removes Manara; see the factory reset
  protection idea in the conversation of 2026-11-20 (to be checked in AOSP first).
- Each new rule must add its loosening case to `domain.Loosens` (the `new-enforcer` skill says so).
