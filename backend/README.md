# Manara backend

Phase 2's real backend (`docs/roadmap.md`), replacing `stub-backend/`.
Domain / transport / persistence layering per
[`../docs/architecture.md`](../docs/architecture.md) §3:
`internal/domain` has no HTTP or SQL imports and defines the ports
(`DeviceRepository`, `CommandQueue`, etc.); `internal/persistence/postgres`
implements them; `internal/transport/{agent,console}` translates HTTP ↔
domain calls and holds no business rules.

## Run it

```bash
cd backend
docker compose up --build -d
```

Brings up Postgres and the server (migrations run automatically on
startup — `IF NOT EXISTS` throughout, safe to re-run). Server listens on
`:8080`.

### Bootstrap a test parent

There's no real parent signup yet — that's Phase 3's "Parent auth /
account model," deliberately not invented here. For now:

```bash
docker compose exec server /usr/local/bin/manara-server -seed
```

Prints a `parentId`, a `parentSession` bearer token (for `/console/*`
calls), and a one-time `enrollmentToken` (for the agent's `/enroll` call —
same QR/manual-entry flow as `agent/`'s `EnrollmentActivity`).

## Try it

```bash
# Enroll (consumes the enrollment token -- single-use, per the API spec)
curl -s -X POST http://localhost:8080/api/v1/enroll \
  -H "Content-Type: application/json" \
  -d '{"enrollmentToken":"TOKEN","deviceInfo":{"model":"SM-A528B","manufacturer":"samsung","androidVersion":"14"}}'

# Sync (use the deviceToken from enroll)
curl -s -X POST http://localhost:8080/api/v1/agent/sync \
  -H "Authorization: Bearer DEVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"policyVersion":1,"events":[],"commandAcks":[]}'

# Console: list devices, push a policy, queue a command (use parentSession)
curl -s http://localhost:8080/api/v1/console/devices -H "Authorization: Bearer PARENT_SESSION"
curl -s -X PUT http://localhost:8080/api/v1/console/devices/DEVICE_ID/policy \
  -H "Authorization: Bearer PARENT_SESSION" -H "Content-Type: application/json" \
  -d '{"timeLimits":{"enabled":true,"rules":[{"category":"social","packages":["com.instagram.android"],"dailyMinutes":30}]}}'
curl -s -X POST http://localhost:8080/api/v1/console/devices/DEVICE_ID/commands \
  -H "Authorization: Bearer PARENT_SESSION" -H "Content-Type: application/json" \
  -d '{"type":"lock_now"}'
```

## What's not here yet

- **FCM delivery** (`roadmap.md`): commands currently only reach the agent
  via the agent's own polling (`/agent/sync`), no push. The command queue
  itself is already push-ready (persisted, `pending → delivered → acked`),
  wiring FCM is additive, not a redesign.
- **A real migration tool**: `db.Migrate()` just re-runs every embedded
  `.sql` file on every start (`IF NOT EXISTS` makes that safe for now).
  Fine for a single schema version; revisit with `golang-migrate` or
  similar once there's more than one to step between.
- **Parent signup/login** (Phase 3) — the `-seed` flag is a deliberate
  stand-in, not something to build on.
