# `examples/monorepo`

A pnpm workspace with two apps and one shared package, demonstrating the
**hybrid `_testatlas/` orchestration pattern** for monorepos.

## Layout

```
examples/monorepo/
├── apps/
│   ├── api/                  Express 5 ESM API (uses @repo/shared)
│   │   ├── package.json
│   │   ├── server.js
│   │   ├── routes/items.js
│   │   ├── _testatlas-fixture/example-script.json   ← fixture (recipe)
│   │   └── _testatlas/                              ← workspace (api-local)
│   └── web/                  Vite + React 19 web app (uses @repo/shared)
│       ├── package.json
│       ├── vite.config.js
│       ├── index.html
│       ├── src/{main,App}.jsx
│       ├── _testatlas-fixture/example-script.json   ← fixture (recipe)
│       └── _testatlas/                              ← workspace (web-local)
├── packages/
│   └── shared/               @repo/shared (validateItem, normalizeItem)
│       ├── package.json
│       └── index.js
├── package.json              pnpm workspace root (`private: true`)
├── pnpm-workspace.yaml       declares apps/*, packages/*
├── _testatlas-fixture/example-script.json   ← fixture (cross-cut recipe)
└── _testatlas/                              ← workspace (cross-cut)
```

Three `_testatlas/` workspaces live in this tree — one ROOT and one per app.
This is the **hybrid pattern**: cross-cuts at the root, app-local concerns
inside the app.

## Why hybrid

| Option                        | Verdict                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| Single root `_testatlas/`     | Doesn't scale: per-app concerns get muddled into one giant flow list.     |
| Per-app only                  | Cross-cuts (e2e flows, shared package, monorepo-wide reports) are orphaned. |
| **Hybrid (root + per-app)**   | **Recommended.** Each app reasons locally; root carries cross-cuts.       |

See [`docs/MONOREPO.md`](../../docs/MONOREPO.md) for the 5 invariants of the
hybrid pattern.

## Quickstart

```sh
# Install workspace deps (from this directory).
pnpm install

# Validate every _testatlas/ in this tree (root + apps/api + apps/web).
pnpm validate
# OR equivalently:
node ../../scripts/validate-workspace.js --all-workspaces .

# Regenerate any single workspace from its fixture.
node ../../scripts/regenerate-example.js .              # ROOT
node ../../scripts/regenerate-example.js apps/web       # web-local
node ../../scripts/regenerate-example.js apps/api       # api-local

# Or all three at once:
pnpm regenerate-all
```

## What lives where

### Root `_testatlas/` (cross-cuts)

- Domain `shared-package` for `@repo/shared` — owned by the monorepo, not by
  any one app.
- A flow that crosses apps (`e2e-create-item-end-to-end`: web → api → shared).
- A `package-version-sync-check` flow exercising monorepo plumbing.
- An issue surfacing a cross-app risk (`shared-package-version-drift-risk`).

### `apps/web/_testatlas/` (web-local)

- Domains `web-routing`, `web-components`, `web-state`.
- App-only flows: landing-page-load, submit-item-form, validation errors,
  network errors.
- App-only issues: form lacks loading state, error toast not aria-live.

### `apps/api/_testatlas/` (api-local)

- Domains `items-api`, `health`, `validation`.
- App-only flows: create-item, list-items, validate-item, health-check.
- App-only issues: POST lacks rate limiting, list lacks pagination.

## Cross-cut references

When an artifact in the root workspace points to a per-app artifact, it
**must qualify the path** with the workspace-relative prefix:

✅ `apps/web/_testatlas/flows/FLOW-web-routing-submit-item-form.md`
❌ `submit-item-form` (ambiguous when both apps have a domain named the same)

This rule is documented as Invariant 3 in `docs/MONOREPO.md`.
