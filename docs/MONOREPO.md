# Monorepo Pattern: Hybrid `_testatlas/` Orchestration

This document describes the recommended pattern for using TestAtlas in a
monorepo (pnpm workspace, npm workspaces, Turborepo, Nx, etc.). The
**hybrid pattern** keeps each app's quality intelligence local to that app
while still allowing cross-cutting concerns — shared packages, end-to-end
flows, monorepo-wide reports — to live somewhere coherent.

A worked example ships with TestAtlas at [`examples/monorepo/`](../examples/monorepo/).

## Overview

A capable AI agent running `/atlas:init` against a monorepo has three options
for where to put `_testatlas/`:

| Option                          | Pro                                                                 | Con                                                                              | Verdict                |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| **A. Single root `_testatlas/`**  | Simplest. One `validate-workspace` invocation.                      | Per-app concerns get muddled into one giant flow list; doesn't scale to 5+ apps. | Doesn't scale.         |
| **B. Per-app only (`apps/*/_testatlas/`)** | Each team owns its workspace; clean per-app orientation.    | Shared package and cross-app flows have no home.                                 | Cross-cuts orphaned.   |
| **C. Hybrid: root for cross-cuts + per-app** | Each app reasons locally; root carries cross-cuts.          | Slight duplication risk; needs explicit scoping rules (the 5 invariants below).  | **Recommended.**       |

## The 5 Invariants

The hybrid pattern is enforced by these 5 rules. The
[`examples/monorepo/`](../examples/monorepo/) example demonstrates every one;
the orchestration tests in
[`test/examples/monorepo-orchestration.test.js`](../test/examples/monorepo-orchestration.test.js)
encode them as machine-checkable assertions.

### Invariant 1 — App-local concern → app `_testatlas/`

A page that is only mounted in `apps/web/`, an endpoint that only exists in
`apps/api/`, or a flow that exercises one app in isolation belongs in **that
app's** `_testatlas/`. The slug pool is private to the app.

### Invariant 2 — Cross-cut concern → root `_testatlas/`

A flow that crosses apps (web → api → shared), a domain that lives inside
`packages/shared/`, or a monorepo-wide report (e.g. `reports/REPORT-monorepo-latest.md`)
belongs in the **root** `_testatlas/`. The shared package itself has no
single app to "own" it; the root workspace is its home.

### Invariant 3 — No duplication

A given domain, flow, or issue ID exists in EXACTLY ONE workspace. The root
workspace's `app_map.md` lists per-app workspaces by relative path; per-app
workspaces optionally back-reference the root via `_testatlas/00_overview.md`
"parent workspace" link. **Cross-cut artifacts in the root MUST qualify
references with the relative workspace path** (see the next section).

### Invariant 4 — `validate-workspace` runs N+1 times

For a monorepo with N apps, `validate-workspace` runs N+1 times: once per
`apps/<name>/_testatlas/` and once at the root `_testatlas/`. Every workspace
is validated independently — the root workspace's pass/fail is decoupled
from any per-app workspace's pass/fail. CI matrices iterate the apps + root.

### Invariant 5 — Slug namespace per workspace

A flow named `login` in `apps/web/_testatlas/` and another flow named `login`
in `apps/api/_testatlas/` are FINE — slugs are workspace-scoped, not
monorepo-scoped. The root workspace introduces a prefixed slug like
`web-login` only if it references the per-app flow in a cross-cut report.

## Cross-Workspace Reference Syntax

When an artifact in the **root** `_testatlas/` references a per-app artifact,
it MUST qualify the path with the workspace-relative prefix. This avoids
ambiguity when more than one workspace happens to use the same slug.

```
✅ apps/web/_testatlas/flows/FLOW-web-routing-submit-item-form.md
✅ apps/api/_testatlas/flows/FLOW-items-api-create-item.md

❌ submit-item-form     (ambiguous — does it live in web or api?)
❌ FLOW-create-item     (no workspace context)
```

In `examples/monorepo/`, the root workspace's e2e flow embeds qualified
references in its `goal` field:

> "Submit an item via `apps/web/_testatlas/flows/FLOW-web-routing-submit-item-form.md`,
> watch it POST to `apps/api/_testatlas/flows/FLOW-items-api-create-item.md`,
> and confirm `validateItem` from `@repo/shared` accepts the same shape on both ends."

## Validate-Workspace Orchestration

There are two equivalent ways to validate a hybrid-pattern monorepo.

### Per-workspace (explicit)

```sh
node scripts/validate-workspace.js --workspace examples/monorepo/_testatlas
node scripts/validate-workspace.js --workspace examples/monorepo/apps/web/_testatlas
node scripts/validate-workspace.js --workspace examples/monorepo/apps/api/_testatlas
```

This is what a CI matrix axis looks like. Each row is independent, so a
failure in `apps/web` doesn't gate the validation of `apps/api`.

### All-workspaces (auto-discovery)

```sh
node scripts/validate-workspace.js --all-workspaces examples/monorepo
```

`--all-workspaces` walks the path recursively, finds every `_testatlas/`
directory (skipping `node_modules`, `.git`, `dist`, `build`, `.next`,
`.expo`, `coverage`, and `.testatlas`), and validates each in turn. Output
is a per-workspace block followed by an aggregate line:

```
[PASS] _testatlas
[PASS] apps/api/_testatlas
[PASS] apps/web/_testatlas

OK 3/3
```

`--all-workspaces` and `--workspace` are mutually exclusive — pick one.
Exit code is 0 only if every discovered workspace passes; if any one fails,
the overall exit is non-zero and the failing path appears in the aggregate
line (`FAIL 1/3 (apps/web/_testatlas)`).

## CI Integration

The `--all-workspaces` flag is intended for CI. The Plan 08-04 GitHub Actions
matrix uses it as the canonical way to validate a monorepo without enumerating
each workspace path in the workflow file. The pattern is:

```yaml
- name: validate every TestAtlas workspace
  run: node scripts/validate-workspace.js --all-workspaces examples/monorepo
```

For a real-world repo with many apps, you may prefer a matrix axis that
gates parallel validation per app — but for most cases `--all-workspaces`
is enough and keeps the CI workflow concise.

## Worked Example

[`examples/monorepo/`](../examples/monorepo/) ships a 3-workspace tree:

```
examples/monorepo/
├── package.json                  pnpm workspace root, private:true
├── pnpm-workspace.yaml           apps/*, packages/*
├── apps/
│   ├── api/                      Express 5 ESM (uses @repo/shared)
│   │   ├── package.json (@repo/api, depends on @repo/shared via workspace:*)
│   │   ├── server.js, routes/items.js
│   │   ├── _testatlas-fixture/
│   │   └── _testatlas/           ← Invariant 1: api-local
│   └── web/                      Vite + React 19 (uses @repo/shared)
│       ├── package.json (@repo/web, depends on @repo/shared via workspace:*)
│       ├── vite.config.js, src/{main,App}.jsx
│       ├── _testatlas-fixture/
│       └── _testatlas/           ← Invariant 1: web-local
├── packages/
│   └── shared/                   @repo/shared (validateItem, normalizeItem)
├── _testatlas-fixture/
└── _testatlas/                   ← Invariant 2: cross-cuts
```

Per-workspace artifact counts:

| Workspace                              | Domains | Flows | Issues |
| -------------------------------------- | ------- | ----- | ------ |
| `examples/monorepo/_testatlas/`        | 3       | 2     | 1      |
| `examples/monorepo/apps/web/_testatlas/` | 3       | 4     | 2      |
| `examples/monorepo/apps/api/_testatlas/` | 3       | 4     | 2      |

Quickstart:

```sh
# From inside examples/monorepo:
pnpm install
pnpm validate         # validates all 3 workspaces
pnpm regenerate-all   # regenerates all 3 from fixtures
```

## Common Gotchas

1. **Slug collisions across workspaces are FINE.** Invariant 5 makes the
   slug namespace per-workspace. Only the qualified path resolves
   unambiguously. Two flows named `login` in `apps/web/` and `apps/api/`
   cause no validation failure.

2. **Cross-cut artifacts MUST use qualified paths.** If you wrote a root
   workspace flow that says "see `login`" without a workspace prefix, you
   broke Invariant 3. Use `apps/web/_testatlas/flows/FLOW-…-login.md`
   instead.

3. **Don't duplicate the same domain in both root and per-app.** A domain
   either lives in the root (because it's cross-cutting like
   `shared-package`) or in an app (because it's app-local like
   `web-routing`). Putting `auth` in both root and `apps/api/_testatlas/`
   silently splits the issue list and confuses every reader.

4. **`.testatlas/` is the SUITE tree, not a workspace tree.** It contains
   instructions, schemas, and the install manifest. `--all-workspaces`
   excludes it from discovery on purpose. Don't confuse it with `_testatlas/`.

## When NOT to Use Hybrid

The hybrid pattern adds slight duplication discipline. If your monorepo has:

- **Only one app** — use a single root `_testatlas/`. There are no
  cross-cuts to put anywhere else.
- **No cross-cuts at all** (no shared package, no e2e flows that traverse
  multiple apps) — per-app-only is fine. A root `_testatlas/` adds nothing.
- **Apps that genuinely don't share code** (e.g. unrelated tools shipped
  in one repo for convenience) — per-app-only. Treat each app as its own
  TestAtlas project.

For everything else — most monorepos in 2026 have at least one shared
package and at least one e2e flow — **hybrid is the safe default.**
