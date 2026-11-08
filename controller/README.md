# Manara Controller (web app)

One responsive web app the parent uses from a **phone or a PC** — device list,
policy editor, time-limit UI, location view, remote lock, "not reporting" alerts.

Status: **in use** against the real backend (Render) on two Samsung phones.
Sign-up, sign-in, password reset by email, and an Account page that deletes
the account. Phones show the child's name and color. "Add a phone" walks the
parent through the statements, the brand's steps and the checklist, then shows
the single-use code as a QR code and text. Guided setup is a live timeline
that shows, under the step the phone is on, what it needs (pairing QR code or
code box, accounts to remove, accounts to sign back in to, Finish). Rules:
time limits, lock schedule, site filter, Chrome, settings restrictions; a
saved rule says whether the phone was woken to apply it. Sharing: location,
daily usage report. Activity: protection status, daily app usage, limit
history. Lock now; release, move, release code. Public pages: privacy policy,
parent guide, account deletion. Call logging is not editable (the agent does
not collect it).
Phase 3 in [`../docs/roadmap.md`](../docs/roadmap.md).

It holds no rules of its own; it is a view over the backend `console/` API
defined in [`../api-spec/openapi.yaml`](../api-spec/openapi.yaml).

Stack: Preact + TypeScript + Vite (React's API, smaller), per
[`../docs/decisions/0002-stack-and-reuse.md`](../docs/decisions/0002-stack-and-reuse.md).

## Run

```
npm install
npm run dev
npm test        # API client, session store, and formatting (Node's built-in runner)
npm run build   # type-check + production build
npm run lint
```

The API base URL defaults to `http://localhost:8080/api/v1`; override it with
`VITE_API_URL` at build/dev time.

### In Docker

`backend/docker-compose.yml` builds this directory into the `caddy` image
([`Dockerfile`](Dockerfile)): the console is served at `/` and `/api/*` is
proxied to the server, on the same origin, so the console needs no CORS. The
image is built with `VITE_API_URL=/api/v1`. After changing the console, run
`docker compose up -d --build caddy` from `backend/`. Locally that is
`https://localhost/`, with Caddy's self-signed certificate (the browser warns
once).

### Policy edits are whole-document replacements

`PUT /console/devices/{id}/policy` replaces the entire policy. Each editor
(time limits, lock schedule, location, site filter, restrictions) therefore
reads the current policy (`GET`) right before saving and replaces only its own
section, keeping every other section. Fields the server's own `Policy` struct
does not define are dropped on every read and save (`TestPolicyRoundTrip*`
pins this), so a new policy field must be added to the backend as well as the
agent before the console is used. Two editors open at once
do not overwrite each other. Two parents' edits in the same instant can still
race, with the later save winning. Testing note: saving a policy or pressing
Lock on a real enrolled phone changes that child's phone, so test against a
throwaway device.

### Session token

The backend returns the parent session as a bearer token in the response body
(there are no cookies). The app keeps it in `sessionStorage`, so it ends when
the tab closes. Any script running on the page can read it, so keep the app
free of third-party scripts. "Sign out" only clears the browser's copy: the
backend has no logout endpoint yet, so the session stays valid server-side
until it is revoked there. A 401 from any call clears the stored token and
returns to sign-in.

Dev server defaults to `http://localhost:5173`. The backend (`../backend/`)
must be running on `:8080` with `CORS_ALLOWED_ORIGIN=http://localhost:5173`
(or unset, which defaults to `*`) for API calls to succeed.

---

Generated from `npm create vite@latest -- --template react-ts`. Below is the
template's own documentation, kept for reference:

### React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

#### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

#### Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
