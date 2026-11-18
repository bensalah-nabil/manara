# ADR-0009: One record of who pauses which app

- Status: Accepted
- Date: 2026-11-15
- Unblocks roadmap D2 (block screen) and P14 (prayer-time pause); C5 (bonus time, pause) uses it too.

## Context

Two rules pause apps with `DevicePolicyManager.setPackagesSuspended` today, and P14 adds a third:

| Rule | Its own list | Resumes when |
|---|---|---|
| App time limits (`TimeLimitEnforcer`) | `time_limit_enforcer` / `suspended_packages` | the limit resets or the rule changes |
| Other browsers (`BrowserBlockEnforcer`) | `browser_block_enforcer` / `blocked_packages` | the parent turns it off |
| Prayer-time pause (P14, not built) | would be a third list | the pause ends |

Each rule knows only its own list. When it resumes "its" apps, it also reopens an app another rule
still wants closed. Read in the code: both existing rules re-pause their full list on every run, and
`LiveRules` reruns them every minute while the screen is on, so the app closes again within about a
minute. (The roadmap's note that it "would not close it again" is not what the code does.) Example:
Instagram is over its daily limit when a prayer pause starts. At 13:05 the pause ends and reopens
Instagram, and for up to a minute the child can use it before the time limit closes it again.

The block screen needs more than a fix for that window. When the child opens a paused app, Android
shows its own "blocked by your admin" dialog with the admin's **short support message**: one message
for the whole phone, not one per app (AOSP `android15-release`, `ActivityStartInterceptor` and
`ActionDisabledByAdminDialogHelper`; roadmap, "Where the build run stopped"). To say "Prayer time, back
at 13:05" or "Today's time for Social media is used up", Manara has to know every reason an app is
paused right now, and today no single place does.

## Decision

A shared `AppPauses` component becomes the only code that calls `setPackagesSuspended`.

- **Holds, not commands.** Each rule declares the full set of apps it holds closed, under its own id:
  `hold("time-limit", setOf(...), until = null)`, and `hold(id, emptySet())` to let go. An app is
  paused while at least one rule holds it and reopens only when none does.
- **Pure decision, thin I/O** (CLAUDE.md). `PauseDecision` takes the holds before and after a change
  plus what Manara last applied, and returns what to pause, what to resume and the reasons per app.
  `AppPauses` stores the holds and applies the result.
- **Storage:** one SharedPreferences file of `app → rules holding it`, written with `commit()` so a
  killed process doesn't lose it. No Room table, so no database version bump.
- **Refusals:** `setPackagesSuspended` returns the apps Android refused (essential apps). They are
  reported to the rule that asked, as health problems, as today.
- **The block screen (D2) reads the reasons:** after every change, the short support message is
  rewritten from them (under 200 characters, as the method's documentation asks), and the long one
  lists every paused app with its reason. Both are set again on `ACTION_LOCALE_CHANGED`, as their
  documentation requires.
- **Release:** `releaseAll()` reopens every held app and clears the file.
- **Not a capability:** `AppPauses` is infrastructure, like `EnforcerRegistry`. Rules keep their
  decision logic; only the I/O call moves.

## Migration

On first run, seed the holds from the two existing lists: `suspended_packages` under `time-limit` and
`blocked_packages` under `browser-block`. After that, those keys are not read again. A phone updated
mid-pause keeps every app closed that was closed before.

## Consequences

- No reopen window and no flicker: an app's state changes only when the last rule lets go.
- The block screen, the home screen and the managed notice can all say why an app is paused.
- P14 and C5 declare holds and stay "one class plus one line".
- **Cost:** the two existing rules change their I/O path, so both must be checked again on a phone,
  on a release build: a time limit reached and reset, other browsers blocked and unblocked, a release
  with apps paused, and an update installed while apps are paused.

## Alternatives considered

- **Keep separate lists** (today): the reopen window stays, and the block screen can't say why.
- **Each rule checks the others' lists before resuming:** every rule then knows every other one, which
  breaks "one class per capability".
- **Ask Android** (`isPackageSuspended`): it says whether an app is paused, not why or by which rule.

## Plan, once accepted

1. `PauseDecision` and its unit tests, including random sequences of holds and releases.
2. `AppPauses`: storage, migration, refusals, release.
3. `TimeLimitEnforcer` and `BrowserBlockEnforcer` switched to holds; their decisions unchanged.
4. Checked on the emulator, then on the A52 with a release build.
5. Then D2 (the support messages) and P14 (the prayer pause), each as its own change.

## Verified, and not yet

- **Seen on the A52** (SM-A528B, Android 14, One UI, release 1.0.29, 2026-11-17): opening TikTok,
  paused by a daily limit, showed Samsung's "Action not allowed" dialog with Manara's short support
  message, both reasons included. Not yet seen on the A045F, nor after a change of language.
- **Bedtime seen on the A52** (release 1.0.30, 2026-11-18): a test window held 148 apps under the
  `bedtime` rule next to the three browsers `browser-block` already held; TikTok's dialog gave the
  bedtime sentence alone. Android refused the Play Store (the required installer), as
  `canSuspendPackageForUser` says; Manara logs that and does not report it as a problem.
- **Bedtime's exceptions seen on the A52** (release 1.0.31, 2026-11-18): the `bedtime` rule held
  145 apps and left out the default SMS app (Google Messages) and the parent's `allowedApps`
  (Mawaqit, Al-Azan); the list went from the console through the live server to the phone intact.
- The same message shows for every action Manara blocks, not only a paused app (AOSP
  android14-release and android15-release, Settings `ActionDisabledByAdminDialogHelper
  .setAdminSupportDetails`), so it says who manages the phone before why apps are paused.
