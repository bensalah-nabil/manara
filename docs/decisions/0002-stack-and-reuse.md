# ADR-0002: Technology stack and reuse of prior art

- Status: Accepted (stack); Accepted (Headwind reuse — do not fork)
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

### Resolved: do not fork Headwind MDM

Confirmed at Phase 2 implementation time (not assumed): Headwind's server
(`h-mdm/hmdm-server`) is a Java/Spring/Tomcat monolith, not Go — forking it
would directly contradict the Go decision above, not complement it. The
"borrow agent provisioning know-how" half of the original leaning is also
moot: Phase 0/1's Android agent was already built and verified end to end
from scratch (own AOSP-source research, own on-device testing), with
nothing left to borrow for it.

Clean-build the Go backend per architecture.md §3's layering. Still do
**not** reuse AGPL code (e.g. TimeLimit) in a way that would relicense our
distribution.

## Consequences

- Go backend means contributors need Go; acceptable for the team.
- Contract-first lets two people build the agent and backend in parallel.
- The Headwind decision is deferred, not skipped — it gets its own follow-up
  once someone has read the Headwind source against our architecture.
