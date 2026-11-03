# Roadmap

Ordered by risk, not by what's easy. The whole project hinges on Phase 0 — do
it before building anything else.

## Phase 0 — Prove device-owner enrollment — ✅ core hypothesis proven (2026-11-03)

**Why first:** if a custom agent can't become device owner on real phones, or
Play Protect blocks it, the product doesn't work — better to learn that in a
week than after building a backend.

- [x] Minimal Kotlin app with a `DeviceAdminReceiver` + device-owner manifest.
- [x] Enroll as device owner via ADB on an **already-in-use phone, no
      factory reset** — remove accounts, confirm zero via
      `dumpsys account`, `dpm set-device-owner`, add accounts back. See
      [ADR-0003](decisions/0003-enrollment-without-factory-reset.md) for why
      this works instead of the originally-planned factory reset.
      **Now fully automated**, including the Google account(s) — see
      `scripts/enroll-preflight.sh` / `enroll-backup-apps.sh` /
      `enroll-restore-apps.sh` and `tools/orphan-account-cleaner`, and
      `agent/README.md`'s "Account-tied apps can be backed up..." section.
- [ ] Enroll via the **QR provisioning** flow — the real path for parents
      (enrollment-token-based manual/QR entry into the *backend*, via
      `EnrollmentActivity`, is done and verified; this item is specifically
      about the Android **setup-wizard** QR provisioning flow for a new/
      unprovisioned device, which is untested — low priority now that
      account-removal is the primary, verified method).
- [x] Repeat on a second real device — **Samsung SM-A045F (Galaxy A04s),
      2026-11-03**: full 7-account removal (fully automated, see above),
      `dpm set-device-owner` succeeded, all 5 account-tied apps restored,
      device owner intact throughout. Still Samsung, not the Xiaomi/
      second-OEM diversity originally wanted — see the still-open item
      below.
      **Xiaomi/MIUI (or similarly aggressive OEM) remains untested** — no
      such device available to the team as of 2026-11-03. This is a real,
      open risk (background-app killing, a possibly-different account
      layer), not a silently-dropped requirement.
- [x] Confirmed Play Protect does not flag/block during or after enrollment
      — none seen across dozens of installs/enrollments through 2026-11-03
      (see `pending-verifications.md`; left open-ended since "never seen"
      isn't the same as "can't happen").
- [ ] Check current Google developer-verification rules for sideloaded apps.
- [x] Fallback path (factory reset + cloud restore) documented — see
      [`enrollment-options.md`](enrollment-options.md), option F. Not
      actually needed on either real device tested so far.

**Exit criterion:** a do-nothing agent survives enrollment, reboot, and 24h
idle on both phones without being killed or flagged. **Met on Phone 1**
(Samsung SM-A528B); **pending on Phone 2** (Samsung SM-A045F — device-owner
and app-restore confirmed 2026-11-03, the 24h-idle and reboot-survival
checks specifically are still open, see `phase0-test-report.md`).

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

## Phase 2 — Backend — core done (2026-11-03), FCM and VPS deploy still open

See [`backend/README.md`](../backend/README.md) for how to run it.

- [x] Go server: domain / transport / persistence layering
      (`backend/internal/{domain,transport,persistence}`).
- [x] Postgres schema: parents, devices, device/parent tokens,
      enrollment tokens (single-use), policies, commands, events.
- [x] Idempotent event ingestion (`ON CONFLICT DO NOTHING` on the
      device-generated id — confirmed at the storage level, not just via
      the API response, that a re-sent event doesn't duplicate); persisted
      command queue with the full `pending → delivered → acked|expired`
      lifecycle; a sweep goroutine expiring stale commands.
      **Not yet done:** the "not reporting" *alert* — `Device.Status()`
      computes it correctly and `GET /console/devices` surfaces it, but
      nothing proactively notifies a parent when a device crosses that
      line; today it's only visible if someone looks.
- [ ] FCM delivery with polling fallback — polling (the agent's existing
      `/agent/sync` loop) already works; FCM push itself isn't wired yet.
      The command queue is already push-ready (persisted, not in-memory),
      so this is additive, not a redesign.
- [x] Docker + compose, verified actually working (not just written):
      built the image, brought up Postgres + server together, ran the
      full enroll → sync → console flow against the real containerized
      stack on port 8080 — the same port/tunnel the agent already uses,
      so swapping from `stub-backend/` needed zero agent-side changes.
      Added a Caddy service for TLS termination (architecture.md §6),
      verified working locally (`curl -k` against its self-signed cert,
      confirmed automatic HTTP→HTTPS redirect); secrets moved to a
      gitignored `.env`. **Not yet done:** an actual VPS — decided
      (2026-11-03) to keep developing locally on Docker and migrate once
      one is rented; per `backend/README.md`, that migration is just
      setting a real `DOMAIN` in `.env` (Caddy then gets a real Let's
      Encrypt cert automatically) and dropping the dev-only `8080:8080`
      port mapping — no code change.
- [x] Resolved: do not fork Headwind (confirmed Java/Spring/Tomcat, not
      Go — see [ADR-0002](decisions/0002-stack-and-reuse.md)).
- [x] Parent signup/login: real endpoints
      (`POST /console/auth/signup`, `POST /console/auth/login`,
      bcrypt-hashed passwords, parent sessions), plus
      `POST /console/enrollment-tokens` so a signed-in parent can generate
      their own token instead of relying on `-seed`. `-seed` remains a
      separate dev-only CLI shortcut, not replaced for everyone — see
      `cmd/manara-server/main.go`.

## Phase 3 — Controller (parent web app) — in progress

- [x] Stack decided: React + Vite + TypeScript — see
      [ADR-0002](decisions/0002-stack-and-reuse.md).
- [x] Scaffolded (`npm create vite@latest -- --template react-ts`),
      `npm install` clean, dev server verified booting on `:5173`. CORS
      already wired on the backend side
      (`CORS_ALLOWED_ORIGIN`/`withCORS` in `cmd/manara-server/main.go`) —
      see `controller/README.md`.
- [ ] Parent auth UI (signup/login) against the real endpoints above.
- [ ] Device list, "add device" (generate enrollment token + show it/QR).
- [ ] Policy editor (time limits first), lock button, "not reporting"
      indicator — the backend/agent side of all of these already works
      end to end; this is purely the UI now.

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
