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
cp .env.example .env   # first time only -- edit the values, see comments inside
docker compose up --build -d
```

Brings up Postgres, the server, and Caddy (migrations run automatically on
startup — `IF NOT EXISTS` throughout, safe to re-run). The server itself
listens on `:8080` (dev-only direct access, see the comment in
`docker-compose.yml`); Caddy fronts it with TLS on `:443` (`:80` redirects
there automatically) — verified working locally via `curl -k` against
`DOMAIN=localhost`'s self-signed cert from Caddy's own internal CA.

## Deploying to a real VPS

The whole point of the `DOMAIN` env var is that this is the only thing
that changes:

1. Get a VPS, point the domain's DNS A record at its IP.
2. Copy this directory there (or `git clone`), set `DOMAIN=yourdomain.com`
   and a real `POSTGRES_PASSWORD` in `.env`.
3. `docker compose up --build -d`.

Caddy detects `DOMAIN` is a real, publicly-resolvable hostname and
automatically requests a genuine Let's Encrypt certificate instead of its
local self-signed one — no config or code change beyond that env var.
Once this is live, drop the `8080:8080` port mapping in
`docker-compose.yml` (the one thing that's dev-only) and point the agent's
`ManaraApiFactory.DEV_BASE_URL` at `https://yourdomain.com/api/v1/`,
removing the manifest's `usesCleartextTraffic` concession at the same
time — both already flagged as dev-only in their own comments.

### Bootstrap a test parent

Real signup/login exists (`POST /console/auth/signup`, `POST
/console/auth/login`) -- use those for anything resembling a real parent.
`-seed` remains a separate dev-only shortcut for quick local testing, not
something to build product features on:

```bash
docker compose exec server /usr/local/bin/manara-server -seed
```

Prints a `parentId`, a `parentSession` bearer token (for `/console/*`
calls), and a one-time `enrollmentToken` (for the agent's `/enroll` call —
same QR/manual-entry flow as `agent/`'s `EnrollmentActivity`). A signed-in
parent can also generate their own enrollment token via `POST
/console/enrollment-tokens`.

### Push notifications (FCM)

Optional, additive -- unset (the default), the server logs it and falls
back to `notify.Noop{}`: commands are still enqueued and reach the device
on its next `/agent/sync` poll exactly as before, nothing refuses to
start over a missing push config.

```bash
FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json
```

Get that file from the Firebase console: Project settings → Service
accounts → Generate new private key. See
[`../agent/README.md`](../agent/README.md)'s "Push notifications (FCM)"
section for the matching agent-side setup (four config strings in
`agent/local.properties`, not this file). `internal/notify/fcm` talks to
FCM's HTTP v1 API directly (`golang.org/x/oauth2/google` for the
service-account token) rather than the Firebase Admin Go SDK -- that
package pulls in Firestore, Cloud Monitoring, OpenTelemetry, and gRPC
transitively for one "send a message" call this project doesn't need.

### Parent alerts (ntfy / webhook)

Optional, additive, like push: with neither variable set (the default) the
server logs that alerts are off and nothing else changes. When a phone
newly reports that a protection is missing or failed, the server sends one
short message (device name, which protection, a plain sentence, the report
time -- never user content). The same problem is not repeated for 6 hours
unless it was reported restored in between.

```bash
# ntfy: the full topic URL. On the public ntfy.sh a topic name works like a
# password -- use a long random one. A private ntfy server can use a token.
ALERT_NTFY_URL=https://ntfy.sh/<long-random-topic>
ALERT_NTFY_TOKEN=tk_...            # optional

# Generic webhook: receives JSON {title, message, deviceId, parentId, occurredAt}
ALERT_WEBHOOK_URL=https://example.invalid/hook
```

Both may be set. Install the ntfy app and subscribe to the topic to get the
notification. The destinations come from this environment only, never from
a parent's request, so the server cannot be pointed at an arbitrary address.
A bad URL logs a warning and disables that destination; it does not stop
the server. Errors never log the URL, since it may hold the topic.

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

- **A real migration tool**: `db.Migrate()` just re-runs every embedded
  `.sql` file on every start (`IF NOT EXISTS` makes that safe for now).
  Fine for a single schema version; revisit with `golang-migrate` or
  similar once there's more than one to step between.
