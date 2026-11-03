# Manara Controller (web app)

One responsive web app the parent uses from a **phone or a PC** — device list,
policy editor, time-limit UI, location view, remote lock, "not reporting" alerts.

Status: **scaffolded**, Phase 3 in [`../docs/roadmap.md`](../docs/roadmap.md).

It holds no rules of its own; it is a view over the backend `console/` API
defined in [`../api-spec/openapi.yaml`](../api-spec/openapi.yaml).

Stack: React + TypeScript + Vite, per
[`../docs/decisions/0002-stack-and-reuse.md`](../docs/decisions/0002-stack-and-reuse.md).

## Run

```
npm install
npm run dev
```

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
