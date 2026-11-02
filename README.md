# Manara

**Open-source, parent-visible device management for Android.**
A central console ("an AD for phones") that lets a parent set and enforce
policies on their children's Android devices — screen-time limits, website
filtering, location, and remote lock — from a phone or a PC.

> **Manara** (منارة) means *lighthouse*. It watches over and guides; it does
> not hide. That is the project's one non-negotiable principle — see below.

---

## The one rule: monitoring is always visible

Manara is built for a parent managing their own minor child's device. It is
**not** a covert-surveillance tool and will never be one.

- Every managed device shows a permanent, non-dismissible "This device is
  managed" notice.
- There is **no hidden mode** and no switch to remove that notice. This is
  enforced in the agent and is not a configuration option.
- *What* is collected is fully configurable per policy (location on/off,
  call log on/off, site filter, time limits). *Whether the device shows it
  is managed* is not.

Covert tracking of a person's location or calls is stalkerware, is illegal in
most countries, and gets apps classified as malware by Play Protect regardless
of intent. Keeping monitoring visible is what keeps Manara legal, shippable,
and safe for the families who use it. Contributions that add a hidden or
stealth mode will be rejected.

**Use only on devices you are legally entitled to manage** — your own, or your
own minor child's. See [`docs/legal-and-ethics.md`](docs/legal-and-ethics.md).

---

## What it does

| Capability        | Status  | Notes                                             |
|-------------------|---------|---------------------------------------------------|
| App time limits   | planned | Measure usage, suspend apps past a daily limit    |
| Website filtering  | planned | Private DNS pointed at a filtering resolver        |
| Remote screen lock | planned | Lock the device on demand or on a schedule         |
| Location          | planned | Visible foreground service; history on reconnect   |
| Call log          | planned | Sideload-only; will not pass Play Store review     |
| "Not reporting" alert | planned | Flag a device that has gone dark                 |

Nothing is built yet. This repo is the architecture and the contracts; code
comes next, starting with the device-owner enrollment test (see the roadmap).

---

## Architecture at a glance

Three independent pieces that talk only through a versioned API contract:

```
 Child's phone            Your server              Parent (phone or PC)
┌──────────────┐        ┌──────────────┐          ┌──────────────┐
│    Agent     │  v1    │   Backend    │   v1     │ Controller   │
│  (Kotlin,    │◄──────►│ (Go: domain/ │◄────────►│  (web app,   │
│   Android)   │  API   │  transport/  │   API    │  one UI for  │
│ offline-first│        │  persistence)│          │  phone + PC) │
└──────────────┘        └──────────────┘          └──────────────┘
```

- **Agent** — enforces policy locally even with no network; queues events and
  syncs when it reconnects. One `PolicyEnforcer` per capability, so a new
  policy is one new class.
- **Backend** — three layers that don't leak into each other. The domain layer
  (the rules) knows nothing about HTTP or SQL.
- **Controller** — a single responsive web app, so a parent uses the same
  thing from a phone browser or a desktop. No separate native parent app.

Full detail: [`docs/architecture.md`](docs/architecture.md).
The agent↔backend contract is the keystone: [`api-spec/openapi.yaml`](api-spec/openapi.yaml).

---

## Repo layout

| Path          | What lives here                                        |
|---------------|--------------------------------------------------------|
| `agent/`      | Android agent (Kotlin). Device-owner app.              |
| `backend/`    | Server (Go). Domain / transport / persistence layers.  |
| `controller/` | Parent web UI (phone + PC).                            |
| `api-spec/`   | OpenAPI contract — the shared source of truth.         |
| `deploy/`     | Docker, compose, VPS setup.                            |
| `docs/`       | Architecture, roadmap, legal/ethics, contributing.     |

---

## Getting started

Right now there's nothing to run — the first task is proving device-owner
enrollment works on real phones. See **[`docs/roadmap.md`](docs/roadmap.md)**,
Phase 0.

New contributor? Start with [`docs/contributing.md`](docs/contributing.md) and
[`docs/architecture.md`](docs/architecture.md).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE). Chosen so the project can reuse
Apache-licensed prior art (e.g. Headwind MDM's server and agent provisioning).
