# Contributing to Manara

Welcome — this guide gets a new teammate productive and explains the few rules
that aren't up for debate.

## Read first

1. [`architecture.md`](architecture.md) — how the three systems fit together.
2. [`legal-and-ethics.md`](legal-and-ethics.md) — the visibility principle.
3. [`../api-spec/openapi.yaml`](../api-spec/openapi.yaml) — the contract you
   build against.

## Non-negotiables

- **No hidden-monitoring features.** See the ethics doc. This is the one thing
  that will get a PR closed without discussion.
- **Don't break the v1 API.** Additive changes only; a breaking change is a new
  version path. The agent on a child's phone updates rarely and must keep
  working.
- **The domain layer stays pure.** No HTTP or SQL imports in `backend/internal/
  domain`. No business rules in handlers or in the web UI.
- **Agent capabilities are isolated.** A new policy is a new `PolicyEnforcer`
  implementation, not an edit to existing ones.

## Branch & PR flow

- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<...>`.
- Keep one feature or fix per PR — don't bundle several into one commit.
- Commit style (Conventional Commits):
  `feat(agent): add LockEnforcer`, `fix(backend): dedupe events by id`,
  `docs(api): clarify sync loop`.
- PRs need: a clear description, tests for new logic, and green CI.
- A change to agent↔backend behavior updates `api-spec/openapi.yaml` in the
  **same** PR.

## Who owns what (initial split for a small team)

| Area         | Skills needed                        |
|--------------|--------------------------------------|
| `agent/`     | Kotlin, Android device-admin APIs    |
| `backend/`   | Go, Postgres, clean architecture     |
| `controller/`| React + TypeScript, API clients (stack decided, see [ADR-0002](decisions/0002-stack-and-reuse.md)) |
| `scripts/`, `tools/` | Bash, `adb`/AOSP internals — enrollment automation, not shipped product code |
| `deploy/`    | Docker, VPS, CI — good first area for a DevOps-minded contributor |

Two people *can* work in parallel from day one because both sides build against
the OpenAPI spec rather than each other's code.

## Local setup

Each component's own `README.md` has real, verified steps — don't re-derive
them here:
- [`../agent/README.md`](../agent/README.md) — build with Gradle, enroll a
  real phone as device owner (no factory reset), including the automated
  account-removal scripts.
- [`../backend/README.md`](../backend/README.md) — `docker compose up`,
  env vars, the `-seed` dev shortcut.
- [`../controller/README.md`](../controller/README.md) — `npm install && npm run dev`.

A new contributor (human or LLM) should also read [`../CLAUDE.md`](../CLAUDE.md)
before touching Android or the enrollment scripts specifically — it's a
living list of non-obvious things that already cost real debugging time
once; it's not a substitute for this file or the architecture doc, just a
faster way to not repeat a mistake that's already been made and fixed.

## Decisions

Significant technical choices are recorded as ADRs in
[`decisions/`](decisions/). Propose a new one in a PR before a big change.
