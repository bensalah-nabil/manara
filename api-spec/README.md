# Manara API spec

[`openapi.yaml`](openapi.yaml) is the **single source of truth** for how the
agent, backend, and controller talk. Versioned from v1.

Rule: **never break v1.** Additive changes only; a breaking change becomes a new
`/v2` path served alongside `/v1`. The agent on a child's phone updates rarely
and must keep working against v1.

Both the agent and the controller are built against this file, not against the
backend's internals — that's what lets the three be developed in parallel.

Validate locally with any OpenAPI 3.1 linter (e.g. `redocly lint openapi.yaml`
or `spectral lint openapi.yaml`).
