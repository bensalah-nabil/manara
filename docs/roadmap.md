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
      Since 2026-11-08 guided setup pauses those apps for a few seconds
      instead, and removes nothing
      ([ADR-0006](decisions/0006-pause-apps-instead-of-removing-accounts.md)).
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
      The "not reporting" *alert* is built (2026-11-08): a phone silent for
      `SILENT_PHONE_HOURS` (12 by default) gets one email to its parent per
      silence, through the same alert path as tamper alerts.
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
      [ADR-0002](decisions/0002-stack-and-reuse.md). Moved to Preact later
      (same components, smaller bundle).
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
- [x] **Guided "Add your child's phone", part 1 (2026-11-06).** The old
      one-click "Add a device" is now four steps in the console:
      1. **Confirm** (a prominent notice; the parent ticks that they are the
         parent or guardian, the phone is their minor child's, and the child
         will be told). The server refuses a code without all three and
         records the date, the wording version and the brand with the code
         (`enrollment_tokens.attested_at`, `attestation_version`,
         `phone_brand`). Recorded as stated, not verified.
      2. **Phone type**: how to turn on USB debugging for Samsung (tested),
         Pixel, Xiaomi/Redmi/POCO, Oppo/Realme, OnePlus, Motorola and other
         brands; untested brands carry a clear warning.
      3. **Prepare**: charge, back up chats, have every account password,
         a computer with Chrome or Edge and a cable, USB debugging on. Manara
         never sees or stores passwords.
      4. **Connect**: the code, as before.
      Verified in a browser against the rebuilt server with a throwaway
      parent; a request without the confirmation gets 400 and no code.
- [x] **Part 2: live setup, steered by the server, executed on the phone.**
      Done: first full setup on the SM-A045F (2026-11-07), console-driven
      pairing by QR code and by code on the SM-A528B (2026-11-08,
      [ADR-0005](decisions/0005-setup-inputs-in-the-console.md)). The first
      A52 run failed after removing apps, which led to: apps that hold an
      account removed last, the account list kept across runs, retries for
      steps safe to repeat, and a chaos test ([testing.md](testing.md)).
      Original plan:
      Chosen over WebUSB (needs a cable and a computer; a web page cannot use
      wireless debugging without a helper program) and over adb from the VPS
      through a VPN (one VPN slot on the phone, an unverified path, and one
      server holding shell access to every phone in setup). Manara on the
      child's phone pairs with the phone's own wireless debugging (Android
      11+, Wi-Fi) through Kadb (Apache-2.0) and runs only a fixed list of
      setup actions; the server holds the setup state, shows every step live
      in the console and says which step comes next, but never sends raw
      commands. Account list (names and types only) kept in the database,
      deleted once all are reconnected or after 7 days. After setup:
      wireless debugging off and debugging blocked by device-owner policy.
      Hosting plan: console and server on a VPS, parent accounts created by
      the operator on request, so public signup is to be closed.
      - [x] Toolchain upgrade for Kadb (AGP 9.5, built-in Kotlin 2.4.20,
            compileSdk 37; targetSdk still 34). Coroutines pinned to 1.11.0.
      - [x] **Proof on SM-A528B (2026-11-06):** a test running inside Manara
            paired with the phone's own wireless debugging (code typed by the
            parent) and got `uid=2000(shell)`, read 13 accounts and saw
            Manara as device owner. Read-only commands only; its key was
            deleted afterwards. Kadb is in the test build only so far.
      - [x] `dpm set-device-owner` this way, and the whole flow: verified
            on both Samsung phones.
      - [ ] Not yet: `127.0.0.1` instead of the Wi-Fi IP, other brands
            (Shizuku notes Xiaomi and Oppo/OnePlus need extra developer
            switches).
- [x] **Parent account (2026-11-08):** password reset by email, account
      deletion (refused while any phone is still on the account), the public
      deletion page for Play, and a parent guide page.
- [x] **Chrome rules (2026-11-08):** SafeSearch, YouTube Restricted Mode,
      Chrome's own secure DNS off, a site blocklist (capability-plan B2).
- [x] **Live setup timeline (2026-11-08):** each step shows what it needs
      under it, following the phone every 2 seconds.

## Phase 4 — Hardening (current focus)

> Before new capabilities: the 10 parent interviews in
> [`validation.md`](validation.md) §7. Hardening and shorter setup go on;
> new rule types and new messengers wait for what parents actually report.
> Exception, decided 2026-11-10: Phase 5.0 and four parity features (Phase 5,
> decision 2) go ahead alongside the interviews.

Quality and security, aiming at an independent security assessment
(OWASP MASVS, as App Defense Alliance MASA checks it); the gap analysis and
plan are in [`security.md`](security.md).

- [x] Testing layers: unit, chaos, emulator matrix, real-phone farms
      ([testing.md](testing.md)).
- [x] Retention/purge job for events (location and usage 30 days, others 90).
- [x] Rate limits, expiring sessions and sign-out, server timeouts, console CSP.
- [x] Dependency scans in CI (Go, npm, OSV.dev for the app).
- [x] Two-step sign-in for parents (capability-plan E2).
- [x] Threat model ([threat-model.md](threat-model.md)); its gaps fixed: expiring
      enrollment codes, a pinned Gradle download, the date and time locked.
- [ ] Audit log of parent actions; remove every adb key after setup.
- [ ] Encrypt location data and authenticator secrets at rest.
- [ ] External penetration test; MASA AL1, then AL2 with a lab.
- [ ] Per-manufacturer keep-alive testing matrix.

The full list, with why and when each is done, is in
[security.md](security.md), "What's left".

## Phase 5 — Compete with what parents already have

From [`market-study.md`](market-study.md) (2026-11-10). IDs like C5 refer to
[`capability-plan.md`](capability-plan.md), which holds the design; new items
get an ID here (P1…). Every item still passes that plan's guardrails G1–G7:
visible to the child, opt-in collection, verified on a phone.

**Decided 2026-11-10** (developer, interactively):

1. **Build order:** P3 → P4 → P8 → C5 + D2 + D3 → P5 → P6 → P1 → P2.
   P3 and P4 were chosen first. The order after them is a default: smallest
   first, and P6 last among the parity items because its Device Owner
   behaviour must be verified before coding.
2. **The four parity features start now, alongside the interviews:** ask for
   more time, approve new apps, place alerts, weekly email. The rest of 5.1,
   and all of 5.2, still wait for the 10 interviews in
   [`validation.md`](validation.md) §7.
3. **Revenue model to test first: free for parents, funded by grants or
   donations.** Dinar pricing (P11) and paid setup (P12) stay as fallbacks,
   still asked about in interviews.

Consequence: P8's weekly email ships in English first and gets Arabic and
French with P1.

**Re-decided 2026-11-10, evening** (the developer delegated the decision: "review
the roadmap and re-decide priorities, start without my OK"). It replaces
decision 1's order; decisions 2 and 3 stand.

4. **New build order:** P3 → P1 → P14 → D2 → P2 → P8 → C5 + D3 → P4 → P5 → P6.
   - **P1 moves from last to second.** The goal is now to advertise in the
     region, and an English-only app can't be advertised to Tunisian parents
     (validation §3). An advert in Arabic that opens an English console loses
     the parent at the first screen.
   - **P14 (prayer-time pause) is new** and is the feature the regional advert
     can lead with. No competitor in market-study §2 lists it. *Hypothesis:*
     parents want it; add it to the interview questions.
   - **D2 before C5/D3:** it is the smallest of the three and every pause,
     limit and bedtime needs a screen that says why.
   - **P2 moves up from last:** a locked child who can't call the parent is a
     safety gap (validation §9), and P14 is designed not to add to it.
   - P8, P4, P5, P6 keep their relative order.
5. **Regional positioning:** an optional pack for Muslim families (5.4), off by
   default, inside the same guardrails. The product keeps one name and one
   codebase; nothing is renamed. Manara makes no religious claim of its own
   and names no authority that hasn't reviewed it (P18).

**P1 built 2026-11-10** (branch `regional-pack`), not yet seen on a phone:

- **App:** every string of `ui/Screens.kt`, the three notices and the status screen moved to
  `res/values/strings.xml`, with `values-fr` and `values-ar`. Pure code asks for wording through
  `text/Words`, so `ChildView` and `NoticeSummary` stay unit-tested; a test fails the build when a
  language misses a string or a placeholder. Android 13+ offers the three languages per app
  (`locales_config.xml`).
- **Console:** `messages/en.ts`, `fr.ts`, `ar.ts` (TypeScript refuses a missing key), a language
  switch on the sign-in page, the top bar and the Account page, saved on the parent's account
  (`PATCH /console/account`, migration 0012), `lang` and `dir` set on `<html>`, every `left`/`right`
  rule in `styles.css` replaced by a logical property, base font 16 px and nothing under 14 px.
- **Left in English:** the step messages the phone writes during guided setup (`SetupFlow`, sent to
  the console as text), alert and password-reset emails, and `privacy.html`, `guide.html`,
  `delete-account.html`.
- **Not verified:** no screen was rendered in Arabic, on a phone or in a browser. *Hypothesis:*
  the Android menu names used in the Arabic steps (Developer options, Wireless debugging, Pair
  device with QR code) match what a Samsung shows in Arabic; they are marked `TODO-REVIEW`.

Started 2026-11-10: P14's pure logic, `PrayerTimes` and `PrayerPauseDecision`
with 14 unit tests. Compiled with Kotlin 1.9.24 and run outside Gradle with a
stand-in for JUnit; **not run through `testDirectDebugUnitTest`, not on a
phone, no enforcer, no policy field yet.**

### 5.0 — Before anything else: the gaps every competitor doesn't have

| ID | Item | Why (who already has it) | How | Done when |
|---|---|---|---|---|
| P1 | **Arabic and French**, in the app and the console, with right-to-left layout | Family Link, Screen Time, Samsung and Microsoft are all in Arabic and French. Manara is English only, the biggest gap in the study | Agent: `values-ar`, `values-fr` string resources (no hard-coded text), RTL checked on every screen. Console: a message catalogue and `dir="rtl"`. Parent guide translated | A parent completes guided setup in Arabic on a Samsung; no English left on any screen |
| P2 | **A locked phone can still call the parent** | Family Link's most painful complaint: a locked child "cannot even text their parent". Manara's bedtime and remote lock use `lockNow()`, so only emergency calls work | Research spike: lock task mode with only the dialer and the parent's contacts allowed (*verify* `setLockTaskPackages` / `setLockTaskFeatures` against developer.android.com, Device Owner only). Pure `LockModeDecision` + thin enforcer | During bedtime, the child calls the parent's number; other apps stay closed. Verified on a Samsung |
| P3 | **The offline release code never fails** | Family Link: "keeps rejecting the correct Parent Access Code", one phone locked a week | Test, not a feature: airplane mode, after a reboot, after 30 days without a sync, after an app update | All four pass on a phone |
| P4 | **Fastest filtering server from Tunisia** | AdGuard answered in 96–117 ms vs ~50 ms for Cloudflare on Topnet Wi-Fi (2026-11-10) | The agent measures each candidate DoT host and reports it; the console picks or warns. Also say in the console that the ads filter can slow new pages | Numbers from Topnet, Ooredoo and Orange; the rule cards use the fastest honest host |

### 5.1 — Parity: what parents will expect because Family Link does it

| ID | Item | Who has it | How | Done when |
|---|---|---|---|---|
| C5 | Bonus time and pause, from the console | Family Link, Qustodio, OurPact | capability-plan C5 | Command → effect → ack |
| D2 | Block screen that says why | Every commercial app | capability-plan D2 (`SuspendDialogInfo`) | Seen on a phone |
| D3 | **"Ask for more time"** from the child | Family Link, Kaspersky, Mobicip | capability-plan D3, after D2 and C5 | Request → console → approve → unblocked |
| P5 | **Place alerts** (arrived home, left school) | Family Link, Kaspersky Premium, FamiSafe, Find My Kids | Geofence check on the phone from the existing location fixes (pure `GeofenceDecision`); console draws the places. The child sees "Places your parent gets alerts for" (G1) | Arrival and departure alerts, with Location off reported (A3) |
| P6 | **Approve new apps** | Family Link (its strongest point), Kaspersky | New installs start suspended until the parent allows them (*verify* a package-added receiver plus `setPackagesSuspended` as Device Owner; Play's own install flow can't be intercepted). Console shows the request | A newly installed app stays closed until approved |
| P7 | Ring the phone, see battery level | Family Link, Kaspersky | New `CommandType` `ring`; battery level in the existing report | Rings at full volume even when silent |
| C1 | Different limits on school days and weekends | Family Link, Qustodio | capability-plan C1 | Unit tests at midnight and the week edge; a phone |
| D1 | Child status screen: time left, what's collected | Children rate Family Link 1.4 stars; none of the competitors explain themselves to the child | capability-plan D1 | Matches the console exactly |
| P8 | **Weekly summary by email** to the parent | Qustodio, Norton, Microsoft | From E3's existing usage aggregates; same Brevo channel as alerts. No URLs, no content (G2) | One email a week, in the parent's language (P1) |

### 5.2 — Widen the lead: where Manara is already ahead

| ID | Item | Why | How |
|---|---|---|---|
| B1 | Local DNS filter (VPN) the child can't route around | Already ahead of Family Link (Chrome only) and Microsoft (Edge only); this closes the last holes and lets the filter choose its servers | capability-plan B1 |
| B3 | SafeSearch in every browser | Today SafeSearch is enforced through Chrome rules only | capability-plan B3 |
| B5 | Categories: gambling, dating, VPN/proxy, self-harm | "Family values" covers a few sites in Chrome only; Qustodio and Kaspersky filter by category | capability-plan B5 |
| C3 | School mode: only allowed apps during class hours | Family Link "School time", OurPact | capability-plan C3 |
| P9 | **Tamper report the parent can understand**: "your child tried to reset the phone / add a profile / change the clock" | Only Manara blocks these; telling the parent shows the value | Events from the restriction checks, written for parents, shown in the console |
| P10 | **Move from Family Link in one step** | Parents who tried Family Link already have rules | Console reads nothing from Google; instead, a guided "your Family Link rules → Manara cards" checklist, then the setup removes supervision with the parent | A Family Link family switches in one session |

### 5.3 — Business, not code (from the study)

| ID | Item | Why |
|---|---|---|
| P0 | **Free for parents, funded by grants or donations**: the model under test (decision 3) | Removes the payment barrier entirely. Needs a list of grant sources for child wellbeing and digital safety in Tunisia, and what they ask for (usage numbers, an organisation behind it) |
| P11 | **Price in dinars, paid locally** (fallback) | Foreign subscriptions probably need an international card; Mobicip refuses debit and prepaid cards. *Hypothesis: confirm in interviews* |
| P12 | **In-person setup service** (fallback) | Answers both trust and difficulty, and fits the 80% of phones already in use |
| P13 | **iPhone families: a guide, not an app** | On iPhone, Apple's free Screen Time is better than every third-party app, and Manara's Device Owner approach doesn't exist there. A console page "your child has an iPhone: set up Screen Time like this", in Arabic and French |

### 5.4 — Regional pack: for Muslim families (optional, off by default)

Each item passes G1–G7: the child sees it on the notice and the status screen,
nothing new is collected, and none of it reads content.

| ID | Item | How | Done when |
|---|---|---|---|
| P14 | **Prayer-time pause**: the apps the parent already limits (social media, games) close for N minutes at each prayer the parent ticks | Pure `PrayerTimes` (sun angles, offline, G5) and `PrayerPauseDecision`: **built and unit-tested 2026-11-10**. Still to build: a `prayerPause` policy field (additive, G6), a `PrayerPauseEnforcer` that suspends and resumes the packages (not `lockNow()`: calls and every other app stay open), the child's notice "Prayer time: your apps are back at 13:05", a console card with the day's times and a per-prayer minute adjustment. Location: the parent picks a city in the console, so the pause needs no GPS and collects nothing | On a Samsung, Instagram closes at the computed minute and reopens N minutes later, offline; the times match the Ministry of Religious Affairs timetable for Tunis within 2 minutes (*Hypothesis:* its angles are 18°/18°; check before release) |
| P15 | **Ramadan schedule**: one switch that moves bedtime and daily limits for the month | A console preset over the existing `lockSchedule` and `timeLimits`; no agent change. Dates entered by the parent, not computed | The preset applies and reverts on a phone |
| P16 | **Always-allowed apps**: Quran, school and the phone app never count against a limit or a pause | *Verify first* whether `TimeLimitDecision` already has an exemption list | A listed app stays open during a pause and at zero minutes left |
| B5 | **Family-values filter on the whole phone** (was 5.2) | Today the "Family values" card works in Chrome only (`RuleCards.tsx` l.31): it is the pack's headline and its weakest part. capability-plan B5 | Gambling, dating and alcohol sites closed in every browser |
| P18 | **Review, not a claim** (not code) | Ask one imam or a religious-education teacher, and one family association, to read the pack's wording in Arabic before it is advertised. Never print "approved by" without a written yes | A named reviewer, in writing |

### 5.5 — Design fixes (from reading the code, 2026-11-10; no screen was rendered)

What already holds: one palette (teal, amber lamp) shared by the console and
the app (`styles.css` l.3-24, `Theme.kt`), dark mode, visible focus, reduced
motion, 52 dp buttons, headings marked for screen readers, plain wording on
the rule cards.

| ID | Finding | Where | Fix |
|---|---|---|---|
| X1 ✅ | Every app string is hard-coded; `strings.xml` holds 3 | `ui/Screens.kt`, about 40 `Text("…")` | Move to string resources. First step of P1 |
| X2 ✅ | Console copy is hard-coded in components | e.g. `RuleCards.tsx` l.26-50 | A message catalogue, one file per language. First step of P1 |
| X3 ✅ | Console can't mirror for Arabic | `index.html` `lang="en"`, no `dir`; `styles.css`: 18 `left`/`right` rules, 0 logical ones | `lang`/`dir` from the parent's language; `margin-inline-*`, `inset-inline-*` |
| X4 ✅ | Small text for a non-technical parent, smaller still in Arabic script | `styles.css`: base 15 px, labels at 0.8 rem (12 px) | Base 16 px; no text under 14 px; check Arabic line height |
| X5 | Bedtime and lock windows are whole hours only | `Policy.LockSchedule.Window(fromHour, toHour)` | Minutes, additively (G6). Not needed by P14, which has its own decision |
| X6 | No screen says why an app is closed | no `SuspendDialogInfo` in `agent/` | D2 |

### Won't do (the study's ethics list)

- Listening through the child's microphone (Find My Kids "Sound Around"). Audio is excluded by ADR-0001/ADR-0008.
- Reading message content and AI-scanning it on a third-party server (Bark). Any message capture follows capability-plan Track H and its ADR, encrypted so the server can't read it, and visible to the child.
- An iPhone app (for now). It would be weaker than Apple's own tool. Revisit only if interviews show many iPhones.

## Known hard problems (not blockers, but eyes open)

- **Call logging** won't pass Play Store review — sideload-only distribution
  for that feature.
- **Custom agent builds** may need Google approval to clear Play Protect at
  enrollment on GMS-certified devices.
- **Manufacturer background limits** will be an ongoing maintenance cost.
