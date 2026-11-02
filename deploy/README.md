# Deploy

Docker images, compose files, and VPS setup for self-hosting Manara.

Status: **not started** — lands with Phase 2. Good first area for a
DevOps-minded contributor.

Planned: a `docker-compose.yml` bringing up the Go backend + Postgres behind a
reverse proxy with TLS, plus notes for a small VPS. Secrets live in
`deploy/secrets/` (gitignored) or env vars — never committed.
