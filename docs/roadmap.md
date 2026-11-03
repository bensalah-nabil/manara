# Roadmap

Ordered by risk, not by what's easy. The whole project hinges on Phase 0 — do
it before building anything else.

## Phase 0 — Prove device-owner enrollment (do this first)

**Why first:** if a custom agent can't become device owner on real phones, or
Play Protect blocks it, the product doesn't work — better to learn that in a
week than after building a backend.

- [ ] Minimal Kotlin app with a `DeviceAdminReceiver` + device-owner manifest.
- [ ] Enroll as device owner via ADB on an **already-in-use phone, no
      factory reset** — remove accounts, confirm zero via
      `dumpsys account`, `dpm set-device-owner`, add accounts back. See
      [ADR-0003](decisions/0003-enrollment-without-factory-reset.md) for why
      this works instead of the originally-planned factory reset.
- [ ] Enroll via the **QR provisioning** flow — the real path for parents.
      (This flow does need an unprovisioned device going into it, unlike the
      ADB path above — confirm during testing whether a factory reset is
      actually required for QR provisioning specifically, or whether it
      also just needs zero accounts.)
- [ ] Repeat on at least a **Samsung** and a **Xiaomi** (worst offenders for
      background-app killing, custom-ROM quirks, *and* their own account
      layers — Samsung account / Mi account — which may not clear as
      cleanly as a plain Google account).
      **Status (2026-11-02): Samsung SM-A528B (Android 14) passed — see
      `phase0-test-report.md`. No Xiaomi device available to the team right
      now; Xiaomi/MIUI testing is an open risk, not a blocker — Phase 0 is
      provisionally passed on Samsung alone. Revisit before Phase 1 ships
      broadly, or sooner if a Xiaomi (or another aggressive-battery-management
      OEM — Oppo/Realme/OnePlus's ColorOS also behaves this way) becomes
      available.**
- [ ] Confirm Play Protect does not flag/block during or after enrollment.
- [ ] Check current Google developer-verification rules for sideloaded apps.
- [ ] Fallback path (factory reset + cloud restore) documented and ready if
      account removal can't reach zero on a given phone — see
      [`enrollment-options.md`](enrollment-options.md), option F.

**Exit criterion:** a do-nothing agent survives enrollment, reboot, and 24h
idle on both phones without being killed or flagged.

## Phase 1 — Minimal agent, one policy end to end — ✅ done (2026-11-03)

See [`phase1-plan.md`](phase1-plan.md) for the full build-order detail;
summary here.

- [x] Agent skeleton: policy cache (Room), event queue, sync manager, the
      always-on "managed device" notice.
- [x] First enforcer: **app time limits** (`UsageStatsManager` +
      `setPackagesSuspended`).
- [x] Wire `/enroll` and `/agent/sync` against the v1 spec — real
      `EnrollmentActivity` (manual token + QR scan), `SyncManager`,
      periodic `SyncWorker`, all against `stub-backend/` (throwaway, not
      Phase 2's real backend).
- [x] `LockEnforcer`, `SiteFilterEnforcer`, `LocationEnforcer` — all added
      and verified end to end on the Samsung SM-A528B: a real
      `lockNow()` + pattern-unlock prompt, a real Private DNS mode change
      (confirmed via `settings get global private_dns_mode`, connectivity
      intact) both pinned and reverted, and real GPS fixes reaching the
      backend through the full sync pipeline.
- [x] Found and fixed along the way: enforcement only re-ran when the
      policy *changed*, not on a timer — `SyncWorker` now always
      re-applies the cached policy after syncing, which both matches
      architecture.md's stated design and serves its resilience goal
      (keeps enforcing from the cache even if sync itself fails).

## Phase 2 — Backend

- [ ] Go server: domain / transport / persistence layering.
- [ ] Postgres schema: devices, policies, commands, events.
- [ ] Idempotent event ingestion; persisted command queue; heartbeat +
      "not reporting" sweep.
- [ ] FCM delivery with polling fallback.
- [ ] Docker + compose; deploy to a small VPS.
- [ ] Evaluate forking Headwind's server for enrollment plumbing vs clean build
      (see ADR-0002).

## Phase 3 — Controller (parent web app)

- [ ] Responsive SPA: device list, policy editor, time-limit UI, location view,
      lock button, "not reporting" alerts.
- [ ] Parent auth / account model.

## Phase 4 — Hardening

- [ ] Encrypt location/call data at rest; retention/purge job.
- [ ] Threat-model and pen-test the sync and console APIs.
- [ ] Per-manufacturer keep-alive testing matrix.

## Known hard problems (not blockers, but eyes open)

- **Call logging** won't pass Play Store review — sideload-only distribution
  for that feature.
- **Custom agent builds** may need Google approval to clear Play Protect at
  enrollment on GMS-certified devices.
- **Manufacturer background limits** will be an ongoing maintenance cost.
