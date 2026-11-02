# ADR-0002: Technology stack and reuse of prior art

- Status: Accepted (stack); Open (Headwind reuse)
- Date: 2026-11-02

## Context

We need to choose languages for three components and decide whether to fork
existing open-source MDM code to save time.

## Decision

- **Agent:** Kotlin (standard for Android device-admin work).
- **Backend:** Go — single static binary, clean Docker images, strong HTTP and
  concurrency story, good fit for a stateless service. (Node/TS was the
  alternative, for language-sharing with the web UI; Go won on operational
  simplicity for a self-hosted server.)
- **Controller:** a responsive web SPA (React or Svelte — to be fixed in a later
  ADR when the UI work starts), so one UI serves parents on phone and PC.
- **Contract-first:** agent and backend are built against `api-spec/openapi.yaml`
  from day one.
- **License:** Apache-2.0, chosen partly so we can reuse Apache-licensed prior
  art.

### Open question: fork Headwind MDM?

Headwind's server and agent are Apache-2.0 and already implement enrollment and
device registry. Forking could save months, but its structure may not fit the
domain/transport/persistence layering here.

**Leaning:** clean-build the backend for architectural control, but borrow
Headwind's *agent provisioning* know-how (and possibly code) for Phase 0/1. To
be confirmed after reviewing its repo. Do **not** reuse AGPL code (e.g.
TimeLimit) in a way that would relicense our distribution.

## Consequences

- Go backend means contributors need Go; acceptable for the team.
- Contract-first lets two people build the agent and backend in parallel.
- The Headwind decision is deferred, not skipped — it gets its own follow-up
  once someone has read the Headwind source against our architecture.
