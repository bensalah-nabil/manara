# Roadmap

Ordered by risk, not by what's easy. The whole project hinges on Phase 0 — do
it before building anything else.

Capabilities adopted from other open-source projects, and the ones
deliberately rejected, are planned in [`capability-plan.md`](capability-plan.md)
(milestones M1–M7), on top of the phases below.

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

## Phase 2 — Backend — core done (2026-11-03), VPS deploy still open

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
- [x] FCM delivery with polling fallback — built *and* verified live
      (`domain.CommandType.IsUrgent()`, `internal/notify/fcm` talking to
      FCM's HTTP v1 API directly rather than the bloated Firebase Admin Go
      SDK, `notify.Noop{}` when `FIREBASE_SERVICE_ACCOUNT` is unset). A
      real Firebase project now exists (`manara-abff9`); confirmed
      end-to-end on a Samsung SM-A045F with **zero manual interaction**:
      `lock_now` queued via the console API → live FCM push → device
      woke, synced, and actually locked (`dumpsys power`'s `mWakefulness`
      → `Dozing`, left completely untouched to rule out any interaction
      confound) → acked → lock event reached `GET /console/.../events`.
      Verifying this surfaced and fixed three real, pre-existing bugs on
      the agent side: `pendingCommands` from every sync response were
      parsed but never executed or acked (`LockEnforcer.lockImmediately()`
      existed, just wasn't called); `EnforcerRegistry.collectAllEvents()`
      was defined and called nowhere, so no enforcer-generated event ever
      reached the backend; and `lockImmediately()` swallowed any exception
      from `lockNow()` via a bare `runCatching` with no logging, so a real
      failure would have looked identical to success (`"acked"`) with zero
      signal anywhere — found while chasing what first looked like a
      WorkManager-specific failure that turned out to be test methodology
      (my own `adb` taps immediately re-waking the device right after
      triggering the lock), not a code bug.
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
- [x] Parent auth UI (signup/login) against the real endpoints above, plus a
      read-only signed-in device list (status and last seen). Verified in a
      browser against the containerized backend (2026-11-05): signup, login,
      sign-out, duplicate signup, wrong credentials, session expiry (401 returns
      to sign-in), reload persistence, all three device statuses, and a
      narrow-viewport layout. Test accounts and rows were removed afterward.
      See `controller/README.md` for the session-token trade-offs.
- [x] "Add a device": generates a single-use enrollment code and shows it once
      (copy button, instructions for the agent's manual-entry screen).
      Verified 2026-11-05 against the containerized backend: the code shown in
      the browser enrolled a device through `/enroll` exactly once and was
      rejected (401) on reuse; the new device appeared in the list as "Never
      connected"; an expired session from this button returns to sign-in. Test
      rows were removed afterward. Backend tokens have no expiry, and are
      stored only hashed, so a lost code cannot be shown again.
- [x] QR code for enrollment (2026-11-05). The agent's scanner returns the
      plain token text, so the QR encodes exactly the token. Added one
      dependency, **`qrcode-generator` 2.0.4** (MIT, zero dependencies,
      approved; about +13 kB gzipped). It is drawn as an SVG path from the
      module matrix, never as injected HTML, dark on white with a 4-module
      quiet zone so it scans on the dark theme too. Verified: structural unit
      tests (finder patterns, quiet zone, path covers exactly the dark
      modules); an independent decoder (jsQR, installed temporarily with
      `--no-save` and removed) read the production output back to the exact
      token for 13 tokens at two scales, and failed on a corrupted image; and
      the QR the live page rendered onto a dark background decoded to the
      token shown on the page. **Not verified: an actual phone camera scan**
      with the agent's ML Kit scanner (the Samsung is already enrolled, and
      scanning needs the camera). The text code remains as a fallback.
- [x] Policy editor (time limits only so far), lock button, and the "not
      reporting" indicator (shown on every device card since the list landed).
      Added an additive `GET /console/devices/{id}/policy` (v1 spec updated;
      4 Go tests incl. cross-parent 404) because `PUT` replaces the whole
      policy and the editor must not overwrite what it doesn't show. Verified
      2026-11-05 in a browser against the rebuilt container, **on a fake
      device only**: invalid input sends nothing; a 0-minute limit asks for
      confirmation; saving changed only `timeLimits` (location, site filter,
      lock schedule and restrictions byte-identical afterward, version 3 to 4);
      lock asks for confirmation and a cancelled click queues nothing; the new
      route returns 401 without a session and 404 for another parent. The real
      Samsung's policy (v14) and command queue were not touched. Not yet
      covered: a lock that has been delivered (the UI says "sent", not
      "locked").
- [x] Lock schedule and location editors (2026-11-05). All three editors now
      share one save path (`usePolicyEditor`): read the policy, validate, ask
      for confirmation where it matters, **re-read the latest policy right
      before saving**, replace only that section, save. Verified in a browser
      against the real backend **on a fake device**: invalid windows (no
      day, equal hours) send nothing; a Friday/Saturday 22:00 to 07:00 window
      is stored as days `[6, 7]` (the agent's Calendar numbering, Sunday = 1);
      a location save from an editor holding a stale copy did not overwrite a
      time-limit change made in between (versions 4, 5, 6, all sections
      intact); turning location on from off, and saving a schedule, each ask
      for confirmation. The API spec now states the day numbering, 0-23 local
      hours, overnight windows, and that equal hours never lock. Limits: the
      5 to 1440 minute location interval is this console's own guard, not
      enforced by the backend; the console cannot show whether a lock window
      is active right now (the phone's clock and time zone may differ from the
      browser's); two parents saving at the same instant can still race. The
      real Samsung was not touched.
- [x] Site filter and restrictions editors (2026-11-05), same save path.
      Verified in a browser against the real backend **on a fake device**: a
      blank host, a URL, an IP address and a host with a port are each
      rejected with their own message and send nothing (an enabled filter with
      a blank host is rejected because the agent would then filter nothing);
      a host typed as `  Family.AdGuard-DNS.com. ` is stored as
      `family.adguard-dns.com`; enabling or changing a host asks for
      confirmation, warning that a wrong host can stop the phone looking up
      addresses and so stop it receiving a corrected policy; locking VPN and
      Private DNS settings stored both flags without disturbing the safe-boot
      flag or any other section; the confirmation lists only what is newly
      blocked; a `host_not_serving` report reads as a sentence in Protection
      status. The IP-address rule was checked against AOSP
      (`NetworkUtilsInternal.isWeaklyValidatedHostname` rejects IP literals);
      the console is deliberately stricter than Android (dotted name, no
      underscores). **Finding:** the backend decodes a policy into its own Go
      struct, so a field the struct does not define is silently dropped on
      every read and save. Today every field the agent defines survives (pinned
      by `TestPolicyRoundTrip*`), but a field added to the agent alone would be
      wiped by any console save, so add it to `domain.Policy` as well. Also,
      flags set to false are omitted by the server and read as off by the
      agent. Not verified: that a real phone accepts a given host (only the
      real Samsung could show that, and it was not touched); the "child could
      change the filter" note reflects the policy as loaded when that editor
      opened, so it can be stale until reopened.
- [x] Protection status: each device card lists what the phone has reported
      about protections that stopped working (the agent's `enforcement`
      events), newest report per problem, unresolved ones first. Verified
      2026-11-05 in a browser against the real backend **on a fake device with
      seeded events**: a resolved problem shows as restored, one that broke
      again shows as needing attention, known detail codes read as sentences,
      unknown text is shown as reported, non-enforcement events are ignored,
      the empty state and an expired session are handled. **Limits:** only
      Usage Access, the device Location setting and Private DNS ever report
      "restored"; other reports (a failed suspend, a removed restriction) are
      never cleared, so they stay on screen until a newer report replaces
      them. A phone that is off or offline cannot report, so "no problems" is
      not proof of health. Still missing: alerts that reach a parent without
      opening the app (E4).
- [x] **First console test against the real Samsung (SM-A045F, 2026-11-05).**
      The console has no login for the seed parent (no email or password), so
      this used a temporary session created directly in the database, held in
      one browser tab, and revoked afterward. Through the console UI the
      Facebook daily limit went 0 to 30 (policy v15), a real one-time
      `SyncWorker` ran, and Facebook went from `suspended=true` to
      `suspended=false` in `dumpsys package`; then 30 back to 0 (the
      zero-minute confirmation dialog appeared; v16), another sync, and
      Facebook was `suspended=true` again. Only `timeLimits` changed (every
      other section and the version-14 content were otherwise identical), no
      commands were queued, and the console showed the phone's real
      Protection status history. **Not verified:** the console's own login
      path for this parent, a phone applying a change on its own 15-minute
      timer, and a lock sent from the console. **Finding:** the first sync
      attempt of the second step timed out (`SocketTimeoutException`, worker
      result RETRY) even though `adb reverse --list` still showed the
      tunnel. Removing and re-creating it fixed it, so a listed tunnel is not
      proof it works; check by running a sync, not by listing.
- [x] **E4 tamper alerts (2026-11-05).** An `AlertNotifier` port with ntfy and
      webhook senders, configured by `ALERT_NTFY_URL` / `ALERT_NTFY_TOKEN` /
      `ALERT_WEBHOOK_URL` (see `backend/README.md`). `EventStore.Insert` now
      reports which events were newly stored, so a re-sent backlog never
      alerts twice; repeats of one problem are throttled for 6 hours and a
      restored report clears the throttle. Verified with Go tests and an end
      to end run against a second server instance and a local receiver, **on
      a fake device**. **Not verified:** a real ntfy server or phone app, or an
      alert from the real Samsung. **Not built:** "not reporting" and child
      request alerts; a per-parent destination (deliberately not done: a
      parent-supplied URL would let the server be aimed at any address).
- [x] **E3, first slice: limit history (2026-11-05).** Each device card lists
      when the phone reported a daily limit being reached (category, limit,
      time; 20 most recent), read from the `usage` events the agent already
      sends. Controller only; no phone or backend change. Verified in a
      browser against the real backend **on a fake device**: valid reports
      show newest first, a malformed report and a non-usage event are left
      out, and a category name containing HTML is shown as text. 74 controller
      tests pass. **Not built, deliberately:** per-app minutes. The phone
      never sends them (the only `usage` event is the limit-reached one), so
      a real E3 needs new collection that must be opt-in per policy and shown
      to the child (G2), with retention and encryption at rest still open in
      Phase 4. **Not verified:** the real Samsung's own history in this panel
      (it needs a console login session, and none is open).
- [x] **E3 per-app minutes, opt-in (2026-11-05).** New policy section
      `usageReport: {enabled}` (off when absent). While on, the agent's
      `UsageReportEnforcer` sends a `usage_report` event with today's minutes
      per app (busiest 30, at least one minute, package names only), at most
      about hourly and only when the total changed; the decision logic is
      pure and unit-tested (`UsageReportDecision`). The child sees it on the
      managed notice ("Daily app usage is reported to your parent") and the
      status screen while it is on. Missing Usage Access is reported as an
      `enforcement` problem instead of silently sending nothing. The server
      deletes `usage_report` events older than 30 days (hourly sweep, and at
      start). The console has a toggle (confirmation when turning it on) and
      a "Daily app usage" panel (latest snapshot per phone-local day, 7 days).
      **Verified on the real Samsung:** on (v17), a real report arrived, its
      per-app minutes matched Android's own daily stats (rounded down), the
      notice and status screen showed the disclosure, and the console panel
      showed it; off (v18), no further report, both disclosures gone, every
      other policy section equal to v16, Facebook still suspended. Retention
      and the round trip were verified against a second server instance on a
      fake device. **Not done:** encryption at rest (Phase 4); app labels
      instead of package names; an exact end-of-day figure (snapshots are
      about hourly, so a day's last minutes can be missing).
      **Second phone (SM-A528B, Android 14 / One UI 6.1, 2026-11-06):** same
      on/off test passed (v8 on: 145 min, 13 apps, top three equal to
      Android's own stats rounded down; v9 off: no report, disclosures gone,
      everything else equal to v7). Still Samsung only.
- [x] **Fixed: upgrading from the first build broke the agent (2026-11-06).**
      The A52 still had the 11-02 build (database version 1). Installing
      the current build made every database access fail with "A migration
      from 1 to 4 was required but not found": version 2 had shipped with a
      destructive fallback, and adding real 2-3 and 3-4 migrations removed
      it, leaving no path from 1. Every `SyncWorker` run crashed, which also
      stopped the periodic policy re-apply, so enforcement on that phone had
      silently stopped. Added `MIGRATION_1_2` (creates `command_acks`, the
      statement Room generates), which keeps the stored policy and queued
      events. Verified on that phone: upgrade from version 1, sync succeeded,
      no migration error, managed notice running.

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
