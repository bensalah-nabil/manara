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

## Don't type a DB column stricter than the wire contract actually is

`events.id` was `UUID` in Postgres; `api-spec/openapi.yaml` types `Event.id`
as a plain string (`format: uuid` is a hint, not a constraint). A
malformed id crashed with an opaque 500 instead of a clean 400 — found
testing, from my own test data, not a real agent bug, but it would have
hit the same way from one. Match the column type to what the spec actually
requires, not to what valid input usually looks like.

## `adb shell cmd jobscheduler run -f` doesn't reliably run WorkManager jobs

Five forced runs against a real `CoroutineWorker`, confirmed via a
race-free persisted marker (logcat timing was too unreliable to trust
here), showed zero evidence `doWork()` ever ran. To force-test a
`WorkManager`-backed worker, enqueue a real `OneTimeWorkRequest` instead
(e.g. a temporary test-harness button) — that worked every time the
`jobscheduler run -f` command didn't.

## `adb uninstall -k` does not clear an app's AccountManager token

Verified on a real device (Samsung SM-A045F): `-k` (keep data) blocks the
account-cleanup signal Android sends on a *full* uninstall, so the account
survives right alongside the data it was meant to preserve — the opposite
of what `-k`'s name suggests for this purpose. A full uninstall usually
clears it, but not always: one account (WhatsApp) stayed orphaned (no
installed app, no registered authenticator, account row still present in
`dumpsys account`) through a full uninstall *and* a reboot. Neither `adb`
nor Settings' own Accounts UI can touch an orphaned row like that. Fix:
`tools/orphan-account-cleaner` — any app can register as the
`AccountAuthenticator` for an arbitrary type string (account types aren't
signature-reserved except `com.google`), which is enough standing to call
`removeAccountExplicitly()` directly. See
[`docs/enrollment-options.md`](docs/enrollment-options.md).

## A preinstalled/system app needs `pm uninstall --user 0`, not `adb uninstall`

`adb uninstall <pkg>` fails with `DELETE_FAILED_INTERNAL_ERROR` for an OEM
preinstalled app (Duo on the SM-A045F — installed at `/data/app/Duo/Duo.apk`,
not the usual per-user hashed path, which is the tell). `adb shell pm
uninstall --user 0 <pkg>` is the no-root way to remove it for the current
user.

## Git Bash/MSYS rewrites any absolute-looking path before a native .exe sees it

Not just `adb pull`'s remote-path argument — the same rewrite hit `adb
shell uiautomator dump /sdcard/ui.xml` too (it ran on-device against a
mangled path first). Anything invoking `adb.exe` from this shell with an
argument starting with `/` needs `export MSYS_NO_PATHCONV=1` first, not
just the specific command that happened to be tested.

## `adb shell` inside a `while read <<< "$var"` loop eats the rest of `$var`

`adb shell` forwards its own stdin to the device. Inside `while read -r x;
do adbs shell ...; done <<< "$list"`, that forwarding consumes whatever of
`$list` was left on the loop's stdin, so the loop silently stops after one
iteration — no error, just fewer iterations than expected. Redirect every
`adb` call inside such a loop from `/dev/null` explicitly.

## Key any per-device state by the hardware serial, not the connection address

A wireless-debugging `IP:port` changes on every re-pair, reconnect, DHCP
lease renewal, or reboot (confirmed: same session, same phone, six
different addresses). A script that names a backup directory after
`$SERIAL` orphans its own data the next time that phone reconnects. Use
`adb -s <serial> shell getprop ro.serialno` (stable) as the key instead.

## Restoring a preinstalled/OEM app needs `pm install-existing`, not `adb install`

Removing it with `pm uninstall --user 0` (see above) leaves its
system/product-partition stub in place. Reinstalling the APK pulled while
it was running then fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
("signatures do not match") against that stub. `adb shell cmd package
install-existing <pkg>` re-enables the existing stub for the user
directly — no APK transfer, and it fails harmlessly for a normal app that
has no such stub, so it's safe to just try first for every package.

## The Firebase Admin Go SDK is overkill for just sending FCM messages

`firebase.google.com/go/v4` pulls in Firestore, Cloud Monitoring,
OpenTelemetry, and gRPC transitively — ~40 packages for one "send a push
message" call. Use FCM's HTTP v1 REST API directly instead:
`golang.org/x/oauth2/google` for the service-account token, plain
`net/http`/`encoding/json` for the request. Two dependencies instead of
forty, same result. See `backend/internal/notify/fcm`.

## A sync response field being parsed doesn't mean it's acted on

`SyncManager` decoded `pendingCommands` from every `/agent/sync` response
and `EnforcerRegistry.collectAllEvents()` was fully implemented — neither
was ever actually wired to anything. A `lock_now` command genuinely did
nothing on a real device until this was found and fixed (confirmed via
`dumpsys power`'s `mWakefulness`, not just by reading the code). Both
looked done from the type signatures alone. When adding a new
`CommandType` or a new `PolicyEnforcer` that calls `collectEvents()`,
check there's a real caller all the way through, not just a matching
field/method.

## A bare `runCatching { }` with no `.onFailure` hides real failures as false successes

`LockEnforcer.lockImmediately()` wrapped `devicePolicyManager.lockNow()` in
`runCatching { ... }` and threw the result away — any exception vanished
silently, so `SyncManager` reported `"acked"` for a `lock_now` that could
have actually failed, with zero signal anywhere that anything was wrong.
This specific call turned out not to be throwing (see the adb-interaction
lesson below), but the pattern itself was still a real defect independent
of that — found it while chasing what looked like a different bug. Either
let a safety-relevant call throw and catch it where there's something
useful to do with the error (log it, report "failed" instead of "acked"),
or at minimum `.onFailure { Log.w(...) }` — never a bare `runCatching`
that discards the result.

## Don't trust your own `adb` interaction timing when testing an async device effect

Spent real effort chasing what looked like "`lockNow()` doesn't work when
triggered via `WorkManager`/push, only when triggered from foreground UI
code" — command acked, screen never visibly locked, confirmed over
multiple repeats and even after setting a real PIN. Turned out to be
`adb shell input tap`/`keyevent` commands in my own test script, sent
*right after* triggering the lock to check the result, themselves
re-waking the device before the next `dumpsys power` read could observe
`Dozing`. System logcat (`PowerManagerService: Going to sleep due to
device_admin`) had already shown the call was genuinely succeeding the
whole time. The fix wasn't code — it was leaving the device completely
untouched after triggering, for a full ScheduleWakeup-length wait, before
checking. When a test keeps showing a surprising negative for an async
device effect, check whether the *test's own adb traffic* is the
confound before concluding the feature is broken.

## A wireless-adb reconnect silently drops `adb reverse`

The agent's dev backend URL is `localhost:8080` on the phone, which only
works through `adb reverse tcp:8080 tcp:8080`. After the phone reconnects
(new `IP:port`, new transport), that forward is gone. The next sync just
logs `Worker result RETRY`, with no error pointing at the cause. Re-run
`adb reverse` after every reconnect, before triggering a sync.

A tunnel that `adb reverse --list` still shows can also be dead: a sync
timed out with `SocketTimeoutException` (hang, not refused) while the
listing looked fine, and `reverse --remove tcp:8080` followed by a fresh
`reverse tcp:8080 tcp:8080` fixed it. Judge the tunnel by a sync result,
not by the listing.

## A new policy field needs a rebuilt server container, not just `go build`

`docker compose up -d` reuses the existing image. A server image built
before a new `Policy` field existed silently drops that field on
`PUT /console/.../policy`. The response simply omits it, with no error.
After changing `backend/internal/domain`, run
`docker compose up -d --build server` before testing against the stack.

## After an instrumented sync, check that the managed notice came back

The opt-in device test that runs a real `SyncWorker` ends by killing the app
process, which takes the managed notice down with it. A plain `am start` then
only brought the task's top screen forward. That screen was Settings' Usage
access page, opened from Manara earlier, so Manara never ran. Start it with a
cleared task (`am start -f 0x10008000 -n com.manara.agent/.MainActivity`,
not a force-stop, which would cancel its scheduled work). Then confirm
`ManagedNoticeService` is `isForeground=true` before calling the test done.

## A Room version bump needs a migration from every version that ever shipped

Version 2 shipped with `fallbackToDestructiveMigration()`. Later commits added
real 2-3 and 3-4 migrations and dropped that fallback, leaving nothing for
version 1. A phone still on the first build (the A52) then crashed on every
database access after an in-place upgrade. Every `SyncWorker` run failed, so
enforcement silently stopped, while the phone that had stepped through each
version never showed it. Before removing a fallback or bumping `version`,
check `addMigrations` covers 1 to current. Test an upgrade on a phone that
still has the oldest build, not just the one updated every day.
`ManaraDatabaseMigrationsTest` now fails the build when a step is missing.
When adding a version, add its tables to `DatabaseUpgradeTest` and commit the
new `app/schemas/` JSON.

## A test-only dependency still runs against the app's copy of shared libraries

On-device tests load classes the app also has from the app APK, not the test
APK. Kadb (test-only) was built against kotlinx-coroutines 1.11, the app
resolved 1.8.1, and the test died with `NoSuchMethodError` on a real phone
even though it compiled cleanly. Check `dependencyInsight` for shared
libraries (coroutines, okio, BouncyCastle) when adding a test dependency, and
pin the app to the newer version.

## Test push on a release build, not just debug

Push worked in debug for weeks and failed in every release build: R8 removed
`OverwritingInputMerger`'s no-argument constructor, which WorkManager creates
by reflection for one-time work only. Every push-started sync died at once
(`Could not create Input Merger`), while the periodic sync, which needs no
merger, kept working, so it looked like "push is slow". Google Play services'
own record (`dumpsys activity service com.google.android.gms/.gcm.GcmService`,
"Successful broadcast to com.manara.agent") proved delivery and pointed the
search at the app. Anything loaded by reflection (WorkManager, Firebase
components) needs a keep rule in `proguard-rules.pro`; test it on a release
build on a phone.

## A release build needs `-PMANARA_API_URL`

Without it the build falls back to the dev `http://localhost:8080`, and a
real phone on that build cannot check in at all. It happened installing an
update on the A045F. `preReleaseBuild` now fails unless the URL is HTTPS.

## Don't do silently

Clearing/uninstalling app data, accepting a license agreement, pushing to
`origin`, and removing a user's data on their phone all need an explicit
go-ahead in the moment — approval for one doesn't carry to the next.
