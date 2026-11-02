# Manara Backend (Go)

The central server — the "AD controller." Issues policies, queues commands,
ingests events, tracks which devices are reporting.

Status: **not started** — Phase 2 in [`../docs/roadmap.md`](../docs/roadmap.md).

## Layering (see ../docs/architecture.md §3 — dependencies point inward)

    cmd/manara-server/      main(): wiring only
    internal/domain/        entities + rules. NO http, NO sql.
    internal/transport/     HTTP handlers (agent/ and console/)
    internal/persistence/   Postgres repositories

Built against [`../api-spec/openapi.yaml`](../api-spec/openapi.yaml).

## Key resilience properties to preserve

- Idempotent event ingestion (dedupe on event id).
- Persisted command queue (pending → delivered → acked/expired).
- Heartbeat + "not reporting" sweep.
- Stateless process (horizontal scaling).

## Setup

Will be filled in once the skeleton lands. Target: Go 1.22+, Postgres 15+,
runnable via `deploy/`.
