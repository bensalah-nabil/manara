# Manara stub backend — throwaway, not Phase 2

Implements exactly two endpoints from
[`../api-spec/openapi.yaml`](../api-spec/openapi.yaml) — `/enroll` and
`/agent/sync` — in-memory, no database, no `/console/*`. Exists only so the
agent's `SyncManager` has something real to talk to before Phase 2's actual
Go backend ([`docs/architecture.md`](../docs/architecture.md) §3) is built.
**Delete this directory once Phase 2 starts** — don't grow it into the real
thing; the real backend needs the domain/transport/persistence layering
`architecture.md` specifies, which this intentionally skips.

## Run it

```bash
cd stub-backend
go run .
```
Listens on `localhost:8080`. The enrollment token is hardcoded:
`test-token`.

## Try it

```bash
# Enroll
curl -s -X POST http://localhost:8080/api/v1/enroll \
  -H "Content-Type: application/json" \
  -d '{"enrollmentToken":"test-token","deviceInfo":{"model":"SM-A528B","manufacturer":"samsung","androidVersion":"14"}}'
# => {"deviceId":"...","deviceToken":"...","policy":{...}}

# Sync (replace TOKEN with the deviceToken from enroll)
curl -s -X POST http://localhost:8080/api/v1/agent/sync \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"policyVersion":1,"events":[],"commandAcks":[]}'

# Simulate a parent changing policy (NOT part of the real API --
# /console/* doesn't exist here, this is this stub's own shortcut)
curl -s -X PUT http://localhost:8080/debug/devices/DEVICE_ID/policy \
  -H "Content-Type: application/json" \
  -d '{"version":2,"timeLimits":{"enabled":true,"rules":[{"category":"social","packages":["com.instagram.android"],"dailyMinutes":30}]}}'
```

An agent syncing afterward with `policyVersion: 1` gets back
`policyChanged: true` and the new policy.
