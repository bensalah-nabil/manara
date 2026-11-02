# Phase 1 implementation plan — minimal agent, one policy end to end

Status: **planning only**. Per [`roadmap.md`](roadmap.md), Phase 0's exit
criterion (device-owner enrollment survives reboot + 24h idle on a Samsung
*and* a Xiaomi, via both ADB and QR provisioning, with no Play Protect flag)
has not been confirmed on hardware yet. Nothing below should be built for
real until that passes — see [`phase0-test-report.md`](phase0-test-report.md).
This doc exists so Phase 1 can start immediately once Phase 0 does pass,
instead of re-deriving the design then.

Scope, per the roadmap: agent skeleton (policy cache, event queue, sync
manager, the always-on notice) + the `TimeLimitEnforcer`, wired against
`/enroll` and `/agent/sync` in [`../api-spec/openapi.yaml`](../api-spec/openapi.yaml).
Backend is out of scope for this doc (Phase 2) — Phase 1 needs a stub server
that implements just those two endpoints so the agent has something to talk to.

## 1. What already exists (Phase 0) to build on

`agent/app/src/main/java/com/manara/agent/`:
- `OwnerReceiver` — device-admin component, becomes device owner.
- `ManagedNoticeService` — the permanent notice (ADR-0001). Reused as-is;
  Phase 1 adds no new path to hide it.
- `BootReceiver`, `MainActivity` — survival test + status screen.

Phase 1 builds *around* these, not instead of them. `ManagedNoticeService`
stays exactly as it is.

## 2. Module layout

```
agent/app/src/main/java/com/manara/agent/
├── OwnerReceiver.kt            (existing)
├── ManagedNoticeService.kt     (existing)
├── BootReceiver.kt             (existing)
├── MainActivity.kt             (existing)
├── enroll/
│   ├── EnrollmentActivity.kt   # QR scan or manual token entry → calls /enroll
│   └── EnrollmentRepository.kt # wraps the /enroll call, stores deviceToken
├── policy/
│   ├── Policy.kt               # data class mirroring the OpenAPI Policy schema
│   ├── PolicyDao.kt            # Room DAO
│   └── PolicyCache.kt          # read/replace current policy; exposes version
├── events/
│   ├── Event.kt                # data class mirroring the OpenAPI Event schema
│   ├── EventDao.kt             # Room DAO, append-only
│   └── EventQueue.kt           # enqueue(event); drainBatch(); markAccepted(ids)
├── enforcers/
│   ├── PolicyEnforcer.kt       # the interface from architecture.md §2.2
│   ├── EnforcerRegistry.kt     # holds active enforcers; no concrete refs elsewhere
│   └── TimeLimitEnforcer.kt    # first (only) real enforcer this phase
├── sync/
│   ├── ManaraApi.kt            # Retrofit (or plain OkHttp) interface: enroll, sync
│   ├── SyncManager.kt          # the one round-trip: heartbeat+events out, policy+commands in
│   └── SyncWorker.kt           # WorkManager periodic job calling SyncManager
└── storage/
    └── ManaraDatabase.kt        # Room database tying PolicyDao + EventDao together
```

Dependencies point the same direction architecture.md specifies for the
backend: `enforcers` and `sync` depend on `policy`/`events`, never the reverse.
`EnforcerRegistry` is the only thing `SyncManager` touches when applying a new
policy — it never names `TimeLimitEnforcer` directly (Open/Closed, so adding
`LockEnforcer` later is one new file + one registration line).

## 3. Data flow, end to end

1. **Enrollment.** Parent generates a token in the console (Phase 3 — until
   it exists, the stub backend in §6 accepts a hardcoded token for testing).
   `EnrollmentActivity` gets the token via QR (CameraX + ML Kit barcode) or
   manual entry, POSTs `/enroll` with `deviceInfo`, stores the returned
   `deviceToken` (EncryptedSharedPreferences) and initial `Policy` (Room).
2. **Enforcement.** On boot and on every policy change, `EnforcerRegistry`
   calls `apply(policy)` on each registered enforcer. `TimeLimitEnforcer`
   reads `policy.timeLimits`, checks `UsageStatsManager` for today's usage
   per package/category, and calls `setPackagesSuspended` once a limit is
   hit. It re-checks on a periodic `WorkManager` job (every few minutes while
   the policy has `timeLimits.enabled = true`), not just at apply-time.
3. **Event collection.** Each enforcer's `collectEvents()` is called on the
   same periodic job; a suspension is logged as an `Event` with `kind: usage`
   and a device-generated UUID, written to `EventQueue` immediately (durable
   before any network attempt — architecture.md §2.1).
4. **Sync.** `SyncWorker` (periodic, e.g. 15 min, plus triggered on
   connectivity-regained) calls `SyncManager.sync()`:
   - Drain `EventQueue` (capped batch size, e.g. 200), build the
     `/agent/sync` request body with `policyVersion`, `events`, and any
     `commandAcks` for commands already carried out.
   - On success: drop locally the events whose ids are in
     `acceptedEventIds`; if `policyChanged`, replace the cached `Policy` and
     re-run `EnforcerRegistry.applyAll()`; for each `pendingCommand`, execute
     it (Phase 1 only needs `ping` and `apply_policy` to be meaningful —
     `lock_now`/`request_location` come with their enforcers later) and queue
     the ack for the *next* sync call.
   - On failure (no network, 401, 5xx): leave the queue intact, back off,
     retry on the next scheduled run. A 401 specifically means re-enrollment
     is needed — surface that on `MainActivity`, don't silently loop forever.

## 4. Build order (so there's always something runnable)

1. ✅ Room schema + `PolicyCache` + `EventQueue` with unit tests, no network
   yet.
2. ✅ `PolicyEnforcer` interface + `EnforcerRegistry`, tested with a fake
   enforcer.
3. ✅ `TimeLimitEnforcer` against a manually-constructed `Policy` (no
   server) — verified `setPackagesSuspended` actually blocks (and, once two
   real bugs were found and fixed, actually resumes) a real app on the
   Samsung SM-A528B, via a temporary test harness in `MainActivity`. Found
   in the process: resuming needs durable state (SharedPreferences), not an
   in-memory field — a new enforcer instance (any app restart) forgot what
   was suspended. See commits `be4902e` and `d5e09f9`.
4. ✅ Stub backend (§6) implementing `/enroll` and `/agent/sync` against the
   OpenAPI spec, in-memory store, no Postgres. `stub-backend/`, Go
   `net/http`, smoke-tested end to end (enroll, sync with matching/stale
   `policyVersion`, simulated policy change, wrong-token 401 — all pass).
5. ✅ `ManaraApi` (Retrofit + kotlinx.serialization) + `SyncManager` wired to
   the stub, and `SyncWorker` now actually scheduled — called from
   `OwnerReceiver.onEnabled()` (real enrollment), `BootReceiver` and
   `MainActivity.onCreate()` (belt-and-suspenders, idempotent via
   `enqueueUniquePeriodicWork`'s `KEEP` policy). Confirmed via
   `dumpsys jobscheduler` on the Samsung SM-A528B: a real
   `SystemJobService` entry exists, ~15 min minimum latency matching the
   periodic interval — not just defined in code.
6. Deferred — manual-entry `EnrollmentActivity` isn't built; step 7 used a
   temporary test-harness button in `MainActivity` instead, enough to prove
   the loop works end to end without building real UI yet.
7. ✅ End-to-end manual test, on the Samsung SM-A528B: enrolled against
   stub-backend, pushed a 1-minute Instagram limit via the stub's debug
   endpoint (simulating a parent), tapped Sync, confirmed
   `setPackagesSuspended` actually ran (`dumpsys package com.instagram.android`
   showed `suspended=true`), confirmed opening Instagram was blocked on the
   device. Real bugs found and fixed along the way, not just the happy
   path: the stub bound to `localhost` instead of all interfaces (phone
   couldn't reach it at all), the LAN itself turned out to have client
   (AP) isolation blocking phone→PC traffic regardless of host-side fixes
   (worked around with `adb reverse` instead of relying on LAN routing),
   and the stub's logging only fired per-event so a sync with nothing to
   report looked like it never arrived.

Steps 1-3 need no backend at all and can start the moment Phase 0 passes.

## 5. Why `TimeLimitEnforcer` first (not `LockEnforcer`)

Matches architecture.md's own reasoning (§Phase 1 in roadmap.md): it's the
core feature parents actually want, and it exercises the hardest mechanism
(`UsageStatsManager` + `setPackagesSuspended`, both finicky across OEMs) while
`LockEnforcer` (`DevicePolicyManager.lockNow`) is nearly trivial once device
owner is held — better to hit the hard case first and find OEM quirks early,
consistent with the project's "front-load risk" philosophy from Phase 0.

## 6. Minimal stub backend (not Phase 2's Go server)

A throwaway implementation of exactly `/enroll` and `/agent/sync`, in-memory,
single process, no auth beyond checking the bearer token matches what
`/enroll` issued. Purpose: unblock agent development without waiting on
Phase 2. Suggested: a ~100-line Go `net/http` program (or even a Postman
mock / `prism` running off `api-spec/openapi.yaml` directly, which has the
advantage of validating every request/response against the spec for free).
This code is explicitly disposable — it does not need the layering
architecture.md mandates for the real backend, and should be deleted (or
clearly marked `stub/`) once Phase 2 starts.

## 7. Explicitly deferred to later in Phase 1 (per roadmap.md)

`SiteFilterEnforcer`, `LockEnforcer`, `LocationEnforcer` — added one at a
time after `TimeLimitEnforcer` is proven, each as one new file registered in
`EnforcerRegistry`, no changes to `SyncManager` or `PolicyCache`.

## 8. Open questions to resolve before step 6 (enrollment UI)

- QR payload format: raw enrollment token as plain text, or a JSON blob with
  `enrollmentToken` + server host (needed if the backend host isn't
  hardcoded into the APK)? The latter is more realistic but add complexity;
  propose plain token + hardcoded host for Phase 1, revisit before Phase 3.
- `deviceToken` storage: `EncryptedSharedPreferences` is deprecated-adjacent
  guidance-wise on newer Android — confirm current recommended replacement
  (Jetpack Security's successor, or Keystore-backed storage directly) at
  implementation time rather than assuming today's answer holds.
