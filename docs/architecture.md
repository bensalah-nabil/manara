# Architecture

This document is the reference for how Manara is put together and *why*. If you
are new, read this and [`contributing.md`](contributing.md) before writing code.

## Design goals, in priority order

1. **Visible by design.** A managed device always shows it is managed. No
   hidden mode. This constrains the architecture (see §6) and is not
   negotiable.
2. **Resilient.** The agent keeps enforcing policy with no network, and no
   data is lost or double-counted across flaky connections.
3. **Modular (SOLID).** Each capability is isolated behind an interface so a
   new policy is an added class, not a changed one.
4. **One UI for phone and PC.** The parent console is a responsive web app, not
   two native apps.

## 1. The three systems

```
 Child's phone                Your server                 Parent (phone/PC)
┌────────────────┐         ┌──────────────────┐         ┌────────────────┐
│     Agent      │         │     Backend      │         │   Controller   │
│   (Android,    │  HTTPS  │  Transport layer │  HTTPS  │   (web app,    │
│    Kotlin)     │◄───────►│  Domain layer    │◄───────►│   React/Svelte │
│                │  v1 API │  Persistence     │  v1 API │   + API client)│
│ offline-first  │         │  (Postgres)      │         │                │
└────────────────┘         └────────┬─────────┘         └────────────────┘
                                     │
                              ┌──────┴──────┐
                              │  Postgres   │
                              │   + FCM     │
                              └─────────────┘
```

The three communicate **only** through the versioned HTTP API in
[`../api-spec/openapi.yaml`](../api-spec/openapi.yaml). Neither the agent nor
the controller ever touches the database directly. This is what lets the three
be developed by different people against a stable contract.

## 2. Agent (Android, Kotlin)

### 2.1 Offline-first core

The agent must work with no network. Three local components make this true:

- **Policy cache.** The currently-applied policy is stored locally (Room). The
  agent enforces from the cache, not from the network. A policy update is just
  a cache replacement.
- **Event queue.** Every observation (a usage sample, a location point, a call
  log entry, a lock event) is written to a local append-only queue with a
  device-generated **UUID** and a timestamp — *before* any attempt to send it.
- **Sync manager.** When connectivity is available, it drains the queue to the
  backend and pulls any pending commands/policy. It knows nothing about what
  the events *mean*.

### 2.2 One enforcer per capability (Open/Closed)

```kotlin
interface PolicyEnforcer {
    val id: String                       // "time-limit", "location", ...
    fun apply(policy: PolicyFragment)    // make the device match the policy
    fun collectEvents(): List<Event>     // what to report back
}
```

Implementations, each independent and separately testable:

| Enforcer              | Android mechanism                                   |
|-----------------------|-----------------------------------------------------|
| `TimeLimitEnforcer`   | `UsageStatsManager` + `setPackagesSuspended`        |
| `SiteFilterEnforcer`  | `setGlobalPrivateDnsModeSpecifiedHost`              |
| `LockEnforcer`        | `DevicePolicyManager.lockNow`                       |
| `LocationEnforcer`    | Fused location in a **visible** foreground service  |
| `CallLogEnforcer`     | `CallLog` read (sideload builds only)               |

A registry holds the active enforcers; `SyncManager` and the policy cache
iterate the registry and never name a concrete enforcer. **Adding call logging
= adding one class + registering it.** Nothing else changes.

### 2.3 The visibility guarantee (§ links to design goal 1)

A dedicated, non-optional component owns a persistent foreground notification
and a "managed by" settings entry. It is **not** a `PolicyEnforcer` and has no
"enabled" flag — it is always on whenever the agent runs. Any PR that adds a
way to disable or hide it is out of scope for this project.

### 2.4 Keeping the agent alive (manufacturer reality)

Samsung, Xiaomi, Oppo and others aggressively kill background apps. The agent
must: run as **device owner**, use a foreground service, request battery-
optimization exemption, and reschedule itself via `WorkManager` + a boot
receiver. Treat "survives a reboot and 24h idle on a Xiaomi" as an acceptance
test, not an afterthought.

## 3. Backend (Go)

Three layers. Dependencies point **inward only**: transport → domain ←
persistence. The domain layer imports neither the web framework nor the DB
driver.

```
backend/
├── cmd/manara-server/      # main(): wiring only
├── internal/
│   ├── domain/             # entities + rules. NO http, NO sql.
│   │   ├── device.go
│   │   ├── policy.go
│   │   ├── command.go
│   │   └── event.go
│   ├── transport/          # HTTP handlers, request/response DTOs, auth
│   │   ├── agent/          # endpoints the agent calls
│   │   └── console/        # endpoints the controller calls
│   └── persistence/        # Postgres repositories implementing domain ports
└── ...
```

- **Domain** defines *ports* (interfaces) like `DeviceRepository`,
  `CommandQueue`. Persistence implements them. This is Dependency Inversion:
  the rules depend on an interface, not on Postgres.
- **Transport** translates HTTP ↔ domain calls and nothing more. No business
  rules in handlers.

### 3.1 Command queue (resilience)

Commands to a phone (lock now, apply new policy, start/stop location) are
**persisted** with a lifecycle: `pending → delivered → acked | expired`. An
offline phone simply hasn't moved its commands past `pending`. Delivery is
attempted via **FCM**; the agent also **polls** on its heartbeat as a fallback,
so a missed push is never a lost command.

### 3.2 Idempotent event ingestion (resilience)

The ingestion endpoint keys on the event's device-generated UUID and ignores
duplicates. A phone that re-sends its backlog after a dropped connection
produces no double-counting. This is why UUIDs are generated on the device
(§2.1), not on the server.

### 3.3 Heartbeat & "not reporting"

Each agent check-in updates `last_seen`. A sweep marks a device
`not_reporting` after N missed heartbeats and raises a parent alert. This is
how a deliberately-offline phone becomes *visible as a fact* even though its
live data can't be seen.

### 3.4 Stateless

No session state in process memory → run 2+ instances behind a load balancer,
lose one without downtime. Everything durable is in Postgres. Deploy is Docker;
scaling is horizontal. Two exceptions today, both harmless on one instance:
the alert throttle is in memory (a restart can repeat one alert), and every
instance runs the silent-phone check (two instances could each email the same
silence before either records it). Both move to Postgres before a second
instance is added.

### 3.5 Guided setup

The phone turns itself into a managed device without a computer: Manara pairs
with the phone's own wireless debugging (Kadb) and runs a fixed list of setup
actions (`SetupFlow`, pure and unit-tested; `SetupRunner`; `AdbSetupDevice`).
The server only holds the setup state and the parent's inputs (pairing code,
Finish); it never sends commands. The console shows the state as a live
timeline and is where the parent pairs (QR code or code) and finishes, so the
phone can stay on its Wireless debugging screen
([ADR-0005](decisions/0005-setup-inputs-in-the-console.md)). Nothing is
uninstalled and no account removed: apps that hold an account are paused for
a few seconds (`pm disable-user`), Android is made to recount accounts, and
the apps are turned back on once Manara is the manager, with their accounts
and data as they were
([ADR-0006](decisions/0006-pause-apps-instead-of-removing-accounts.md)). The
account list survives a failed run, and a cut-off run turns paused apps back
on at the next pairing.

### 3.6 Alerts and email

Alerts go through one `AlertNotifier` fan-out: email to the parent the phone
belongs to (Brevo's HTTPS API; SMTP is blocked on the host), plus an optional
operator ntfy topic or webhook. Sources: a protection reported missing or
failed, and a phone silent for `SILENT_PHONE_HOURS`. Password-reset links use
the same email sender. Without an email key, all of this is simply off.

## 4. Controller (web app)

One responsive single-page app, served by (or alongside) the backend, that
talks to the `console/` API. It renders well on a phone browser and a desktop —
one codebase, so a parent uses the identical tool on either. Responsibilities:
device list, per-device policy editing, time-limit editor, location view, lock
button, the guided-setup timeline, the parent's account. It holds **no** rules
of its own; it is a view over the backend API. It is a separate static site
(Netlify) today, not served by the backend.

## 5. The API contract is the keystone

[`../api-spec/openapi.yaml`](../api-spec/openapi.yaml) is the single source of
truth, versioned from **v1**. Rules:

- Agent and controller are built against the spec, not against the backend's
  internals.
- The agent on a child's phone updates rarely. **Never break v1.** Additive
  changes only; a breaking change is a new version path (`/v2`) served
  alongside `/v1`.

## 6. Data sensitivity

Location and call logs are the most sensitive data in the system.

- Collected **only** when the corresponding policy is enabled.
- Short retention by default (configurable); old points are purged.
- Encrypt in transit (TLS) and at rest; treat the location/call tables as
  crown jewels in any threat model.
- The honesty guarantee (§2.3) is also a data-protection measure: the person
  being monitored can always see what is being collected.

## 7. What this architecture deliberately does **not** do

- No hidden/stealth mode (design goal 1).
- No live tracking of a phone with no signal — physics. Last-known point +
  "not reporting" alert instead.
- No iOS parent app — the web controller covers parents on any device.
