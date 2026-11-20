# ADR-0010: The direct build updates itself, as device owner

- Status: Accepted
- Date: 2026-11-18

## Context

Families outside Google Play install Manara from the site (`download.html`, the latest GitHub
release). Until now nothing updated it: a phone stayed on the version it was set up with unless
someone installed the new APK by hand. A bug fix or a safety fix would not reach those families.

## Platform facts (read, not recalled)

- A device owner installs with no prompt, updates of itself included. AOSP android14-release and
  android15-release, `PackageInstallerSession.computeUserActionRequirement`: when
  `isInstallerDeviceOwnerOrAffiliatedProfileOwner()`, it returns before the update-owner and
  permission checks (`noUserActionNecessary`).
- `DevicePolicyManagerService.canSilentlyInstallPackage` (same branches) grants this to the device
  owner on the system user, which `isUserAffiliatedWithDeviceLocked` always counts as affiliated.
- `PackageInstallerService` (android14-release) does not check `REQUEST_INSTALL_PACKAGES`, so
  Manara doesn't declare it.
- Android 11 to 13 (minSdk is 30) were not read. Check them before relying on this there.
- Android itself refuses an update signed with another key, and a lower version code.

## Decision

- **The server says which version to run.** The sync response carries `agentUpdate` (version code
  and name, URL, SHA-256), set by three Render settings: `AGENT_UPDATE_VERSION_CODE`,
  `AGENT_UPDATE_VERSION_NAME` and `AGENT_UPDATE_SHA256`. An empty version code holds every update
  back, and a mistyped setting holds it back too, with a log line saying why. This is the brake if a
  release turns out bad.
- **GitHub serves the file**, from `https://github.com/bensalah-nabil/manara/releases/download/` only.
  The phone checks the SHA-256, the package name and the version code before installing.
- **When:** on Wi-Fi (unmetered), while charging, battery not low; never during guided setup (the
  account watch at its end included) or a release, because an install kills the process. At most
  three tries per version.
- **Never a prompt to the child.** If Android asks for confirmation anyway, the session is abandoned.
- **Direct build only.** Play forbids an app updating itself outside Play, so the code lives in
  `src/direct`; the play build has a stand-in that does nothing.

## Seen on a phone

The A52 (SM-A528B, Android 14), 2026-11-18. It ran 1.0.32, charging, on Wi-Fi. Release v1.0.33 was
published and the three Render settings set. At its next check-in (22:08:22) the phone logged
`installing 1.0.33 (33) over 1.0.32`. Android answered `Session installed` at 22:08:38, and the new
process checked in at 22:08:39. No installer screen appeared. Manara stayed device owner, the managed
notice came back, and the same three apps stayed paused.

The owner's phone, 2026-11-20. It was still on 1.0.33 a day after v1.0.34 was offered. Once v1.0.35
was published and Render set to 35, it updated to 1.0.35 within minutes while charging on Wi-Fi (the
console showed "Manara 1.0.35"), skipping 1.0.34. Why it never took 1.0.34 is not known: either it
was not charging on Wi-Fi in that day, or its three tries failed and it gave up on that version
(`UpdateDecision.MAX_TRIES`; a newer offer starts again). Its log was not read: adb was locked behind
the phone's own wait before loosening (ADR-0012).

## Consequences

- GitHub (Microsoft) sees the phone's IP address when it downloads an update. The privacy page says
  so.
- Publishing a release now has two steps: the GitHub release, then the three Render settings
  (`docs/play-store.md`, "Publish the direct APK").
- Nothing new is collected, so the child's notice doesn't change (ADR-0001). Each phone already
  reports its version, and the console shows it.
- `SyncManager` gained one callback for the offer. An update is not a rule on the phone, so it
  doesn't fit the `PolicyEnforcer` pattern (architecture.md §2.2).
