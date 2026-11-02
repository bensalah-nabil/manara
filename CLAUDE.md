# Working on Manara

Read [`docs/architecture.md`](docs/architecture.md), [`docs/legal-and-ethics.md`](docs/legal-and-ethics.md),
and [`docs/contributing.md`](docs/contributing.md) first — this file doesn't
repeat them, only what's non-obvious and has already caused a real mistake.

## Non-negotiable

**No hidden-monitoring code, ever** — see ADR-0001 and `legal-and-ethics.md`.
This is the one rule with zero exceptions, including "just for testing."

## Before claiming an Android platform fact, read the source

Secondhand claims about `DevicePolicyManager`/AOSP behavior have been wrong
in this project before (e.g. "profile owner needs a clean device" — false;
the real gate is in `DevicePolicyManagerService.java`, read directly, not
assumed from forum posts). When a platform behavior matters, pull the AOSP
source or the official `developer.android.com` reference before asserting
it, and say which one backs the claim. See `docs/decisions/0003-*.md` for
the standard this came from.

## Verify on real hardware, not just by reading the code

Two real bugs this session passed a compiling build and still broke on a
real device (`POST_NOTIFICATIONS` silently dropping a notification; a
`TimeLimitEnforcer` "resume" that never ran because nothing resumes a
package whose rule simply disappeared). Code that touches `DevicePolicyManager`,
`UsageStatsManager`, `AccessibilityService`, or notifications is not done
until it's been run on a phone, not just compiled.

## Keep decision logic separate from Android I/O

`TimeLimitDecision` (pure, unit-tested) vs. `TimeLimitEnforcer` (thin
Android wrapper) is the pattern — matches Google's own current architecture
guidance (avoid framework dependencies in testable logic). Follow it for
every new `PolicyEnforcer`.

## A new capability is one class, not an edit

Open/Closed per `architecture.md` §2.2 — a new `PolicyEnforcer`
implementation plus one line in `EnforcerRegistry`. If a change touches
`SyncManager` or the policy cache to add a capability, stop and reconsider.

## Build & test

```
cd agent
./gradlew.bat assembleDebug       # build
./gradlew.bat testDebugUnitTest   # unit tests (pure logic only — no device)
```
`adb` lives at `C:\Users\nbensalah\AppData\Local\Android\Sdk\platform-tools\adb.exe`
(not yet on PATH). Multiple devices connected → `adb -s <serial> ...`.

## XML comments can't contain `--`, anywhere, not just at the end

Hit this twice in `AndroidManifest.xml` already (both times from using `--`
as an em-dash). `<!-- ... -- ... -->` fails manifest merging with an opaque
parse error, no line number pointing at the real cause. Use `;` or `—`
instead.

## Backticks inside a double-quoted `git commit -m "..."` run as commands

Bash expands them before git ever sees the message — corrupted a real
commit message this session (silently, no error; `git commit --amend -F`
from a file is the fix). Write multi-paragraph commit messages with code
snippets to a temp file and commit with `-F`, not `-m` with backticks
inside double quotes.

## Don't do silently

Clearing/uninstalling app data, accepting a license agreement, pushing to
`origin`, and removing a user's data on their phone all need an explicit
go-ahead in the moment — approval for one doesn't carry to the next.
