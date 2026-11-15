---
name: release-check
description: Checklist to run before any Manara build leaves this PC — a release APK for a phone, a Play bundle, a backend deploy or a console deploy. Use when asked to ship, release, build for a phone, bump the version, upload to Play, or "make a release". Each step comes from a bug that already reached a real phone.
---

# Release check

Go through every section that applies, in order. Report each item as **passed**, **failed**
(with the output), or **not checked** (with the reason). Never report an unchecked item as passed.

Nothing here pushes, publishes, uploads, or installs on a phone in use without the user's
explicit go-ahead at that moment (CLAUDE.md, "Don't do silently").

## 1. What is being released

- `git status` clean, and `git log origin/main..HEAD` shows what is new since the last push.
- Name the targets: the `direct` APK (phones outside Play), the `play` bundle, the server (Render),
  the console (Vercel). Only the matching sections below apply.

## 2. Tests and static checks (all targets)

Run from the repo root; each must pass, and quote the summary lines.

```
cd agent && ./gradlew.bat testDirectDebugUnitTest testPlayDebugUnitTest compileDirectDebugAndroidTestKotlin lintDirectDebug lintPlayDebug
cd backend && go vet ./... && go test ./...
cd controller && npm test && npm run lint && npm run build
```

- Kotlin: the compile prints no new `w:` warnings (`--console=plain`, grep `^w: `).
- Console: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json --noUnusedLocals --noUnusedParameters`.

## 3. The Android release (APK or bundle)

1. **Server URL.** Build with `-PMANARA_API_URL=https://manara-api-pvu4.onrender.com/api/v1`.
   Without it the build used to fall back to `localhost` and the phone could not check in
   (CLAUDE.md, "A release build needs -PMANARA_API_URL"); `preReleaseBuild` now refuses a non-HTTPS URL.
2. **Version.** `-PMANARA_VERSION_CODE=N -PMANARA_VERSION_NAME=1.0.N-1` (or the scheme in use). N must
   be higher than every installed copy and every Play upload: read the phones' current one with
   `adb -s <serial> shell dumpsys package com.manara.agent | grep versionCode`.
3. **Reflection keep rules.** If anything new is created by reflection (WorkManager workers or input
   mergers, Firebase components, kotlinx-serialization classes used only by name), it has a rule in
   `agent/app/proguard-rules.pro`. R8 once removed WorkManager's `OverwritingInputMerger`
   constructor and every push-started sync died in release only (CLAUDE.md, "Test push on a release build").
4. **Database.** If `MANARA_DB_VERSION` changed: `MIGRATIONS` covers every step from 1 to the
   current version, the new `agent/app/schemas/com.manara.agent.storage.ManaraDatabase/<n>.json` is
   committed, and `ManaraDatabaseMigrationsTest` passes. A phone still on version 1 crashed on every
   database access after an upgrade (CLAUDE.md, "A Room version bump needs a migration...").
5. **Build** the targets:
   ```
   ./gradlew.bat assembleDirectRelease -PMANARA_API_URL=... -PMANARA_VERSION_CODE=N -PMANARA_VERSION_NAME=...
   ./gradlew.bat bundlePlayRelease    -PMANARA_API_URL=... -PMANARA_VERSION_CODE=N -PMANARA_VERSION_NAME=...
   ```
   The `play` flavor has no call-log permission; `direct` does (ADR-0008). Don't mix them up.
6. **Run the release build on a real phone** (the `device-verify` skill). Debug passing proves
   nothing about R8. At minimum on the release build:
   - a sync succeeds (`ManaraSyncWorker: sync result: Success`);
   - **push works**: send a command from the console (e.g. `lock_now` on a test phone) and confirm
     the phone acts within seconds; if not, `dumpsys activity service com.google.android.gms/.gcm.GcmService`
     showing "Successful broadcast to com.manara.agent" means delivery worked and the app is at fault;
   - the managed notice is up: `dumpsys activity services com.manara.agent | grep isForeground`;
   - an in-place upgrade from the build the phones run now, not only a fresh install.
   Ask before installing on a phone a family uses; prefer the test phone or the emulator first.

## 4. The server

- Migrations live in `backend/internal/persistence/postgres/migrations` and run at start: a new one must be safe on the live
  database (additive; no column made stricter than `api-spec/openapi.yaml` — CLAUDE.md,
  "Don't type a DB column stricter than the wire contract").
- API changes are additive only (v1). `api-spec/openapi.yaml` is updated with them.
- Locally, test against a rebuilt container: `docker compose up -d --build server`. A stale image
  silently drops new policy fields (CLAUDE.md, "A new policy field needs a rebuilt server container").
- `govulncheck` (CI runs `golang.org/x/vuln/cmd/govulncheck@v1.1.4`) shows nothing new.

## 5. The console

- The Vercel project sets `VITE_API_URL`; `vite.config.ts` now fails a Vercel build without it.
- `npm audit --omit=dev --audit-level=moderate` is clean (CI runs it).
- Changed screens rendered at phone width in Arabic too (right to left), not only in English.

## 6. Ethics gate (every release)

ADR-0001 and `docs/legal-and-ethics.md`: no new data collected without the child's notice saying so,
no hidden monitoring, no message content, no microphone. If the release adds any collection, name where
the phone tells the child, and check the wording exists in English, French and Arabic.

## 7. Report

A short table: target, version, each check with its result, and what was **not** verified on a real
phone. Then list exactly what still needs the user's go-ahead (push, Play upload, deploy, install).
