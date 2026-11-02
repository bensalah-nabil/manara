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
| `controller/`| Web (React or Svelte), API clients   |
| `deploy/`    | Docker, VPS, CI — good first area for a DevOps-minded contributor |

Two people *can* work in parallel from day one because both sides build against
the OpenAPI spec rather than each other's code.

## Local setup

Nothing runs yet — Phase 0 (device-owner enrollment) comes first. As each
component lands, its own `README.md` in that folder will carry setup steps.

## Decisions

Significant technical choices are recorded as ADRs in
[`decisions/`](decisions/). Propose a new one in a PR before a big change.
