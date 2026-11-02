# Roadmap

Ordered by risk, not by what's easy. The whole project hinges on Phase 0 — do
it before building anything else.

## Phase 0 — Prove device-owner enrollment (do this first)

**Why first:** if a custom agent can't become device owner on real phones, or
Play Protect blocks it, the product doesn't work — better to learn that in a
week than after building a backend.

- [ ] Minimal Kotlin app with a `DeviceAdminReceiver` + device-owner manifest.
- [ ] Enroll as device owner on a **factory-reset** phone via ADB
      (`dpm set-device-owner ...`) — proves the app *can* hold the role.
- [ ] Enroll via the **QR provisioning** flow — the real path for parents.
- [ ] Repeat on at least a **Samsung** and a **Xiaomi** (worst offenders for
      background-app killing and custom-ROM quirks).
- [ ] Confirm Play Protect does not flag/block during or after enrollment.
- [ ] Check current Google developer-verification rules for sideloaded apps.

**Exit criterion:** a do-nothing agent survives enrollment, reboot, and 24h
idle on both phones without being killed or flagged.

## Phase 1 — Minimal agent, one policy end to end

- [ ] Agent skeleton: policy cache (Room), event queue, sync manager, the
      always-on "managed device" notice.
- [ ] First enforcer: **app time limits** (`UsageStatsManager` +
      `setPackagesSuspended`). Pick this because it's the core feature.
- [ ] Wire `/enroll` and `/agent/sync` against the v1 spec.
- [ ] Then add, one at a time: `LockEnforcer`, `SiteFilterEnforcer`,
      `LocationEnforcer`.

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
