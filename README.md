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
| Device-owner enrollment | ✅ done, verified on 2 real Samsung phones | No factory reset, no computer: guided setup on the phone, paired from the console by QR code or pairing code, shown as a live timeline ([ADR-0005](docs/decisions/0005-setup-inputs-in-the-console.md)). No app uninstalled, no app data lost: apps holding an account are paused for a few seconds; on Samsung the accounts are removed for a moment and the parent signs back in to Google, guided step by step ([ADR-0006](docs/decisions/0006-pause-apps-instead-of-removing-accounts.md)) |
| App time limits   | ✅ done | `UsageStatsManager` + `setPackagesSuspended`, verified end to end (Instagram on one device, Facebook on another) |
| Remote screen lock | ✅ done | Real `lockNow()`, verified on hardware through a live FCM push in the release build, within seconds; saving rules wakes the phone too |
| Website filtering  | ✅ done | Private DNS, verified via `settings get global private_dns_mode` |
| Chrome rules      | ✅ done | SafeSearch, YouTube Restricted Mode, Chrome's own secure DNS off (so the filter applies), a site blocklist; Chrome's managed configuration, verified on the SM-A045F |
| Location          | ✅ done | Background location at the parent's interval, with its own ongoing notice while on; fails closed without the permission or with Location off device-wide |
| Bedtime lock schedule | ✅ done | Locks the phone in the parent's time windows |
| Daily usage report | ✅ done | Minutes per app, only when the parent turns it on |
| Tamper protection | ✅ done | Factory reset, safe boot, adding users, debugging and the date and time blocked by default |
| Release / move to another account | ✅ done | Only the parent: from the console, or an offline 8-digit code ([ADR-0004](docs/decisions/0004-only-the-parent-releases-a-phone.md)) |
| Call log          | planned | Sideload-only; will not pass Play Store review     |
| Parent alerts     | ✅ done | Email to each parent (Brevo) and ntfy/webhook: a protection stopped working, a phone silent for 12 hours |
| Parent account    | ✅ done | Password reset by email; account deletion in the console, plus the public page Play asks for |
| Backend (Go, Postgres) | ✅ core done | Real signup/login, enrollment tokens, Docker + Caddy TLS, verified containerized |
| Controller (parent web app) | ✅ done (Preact + Vite + TS) | Phones with the child's name and color, live setup timeline, activity, rules, sharing, release, account; parent guide; hosted on Netlify |
| Testing           | ✅ in place | Unit tests, a 5,000-run chaos test of guided setup, an emulator matrix (Android 11 to 16), CI with dependency scans — see [`docs/testing.md`](docs/testing.md) |
| Security          | in progress | Rate limits, two-step sign-in, expiring sessions, CSP; aiming at the MASA badge — see [`docs/security.md`](docs/security.md) and [`docs/threat-model.md`](docs/threat-model.md) |
| Insights          | ✅ done | Screen time trend, when the phone is used, and suggested rules, from the opt-in daily usage report |

See **[`docs/roadmap.md`](docs/roadmap.md)** for the phase-by-phase detail and
what's still open (makers other than Samsung, the on-phone DNS filter and
category blocklists, two-factor sign-in, security hardening).

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
| `agent/`      | Android agent (Kotlin). Device-owner app. See its own `README.md` to build/enroll. |
| `backend/`    | Server (Go). Domain / transport / persistence layers. See its own `README.md` to run. |
| `controller/` | Parent web UI (phone + PC). Preact + Vite + TS, talks to the backend's `/console` API. |
| `api-spec/`   | OpenAPI contract — the shared source of truth.         |
| `scripts/`    | Enrollment automation: account-removal preflight/backup/restore (see `agent/README.md`). |
| `tools/`      | One-off dev tools, not shipped product code (e.g. `orphan-account-cleaner`). |
| `deploy/`     | Docker, compose, VPS setup.                            |
| `docs/`       | Architecture, roadmap, legal/ethics, contributing, ADRs, test reports. |

---

## Getting started

Each component's own `README.md` has real, verified run steps:
[`agent/README.md`](agent/README.md) (build + enroll a real phone),
[`backend/README.md`](backend/README.md) (Docker Compose, env vars),
[`controller/README.md`](controller/README.md) (`npm install && npm run dev`).

New contributor (human or LLM)? Read, in order:
1. [`CLAUDE.md`](CLAUDE.md) — non-obvious lessons already learned the hard
   way; read this before touching Android or the enrollment scripts
   specifically, it'll save you from re-discovering real bugs.
2. [`docs/contributing.md`](docs/contributing.md) and
   [`docs/architecture.md`](docs/architecture.md) — how the pieces fit and
   the non-negotiables.
3. [`docs/roadmap.md`](docs/roadmap.md) — what's done, what's open, in
   priority order.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE). Chosen so the project can reuse
Apache-licensed prior art (e.g. Headwind MDM's server and agent provisioning).
