# TestAtlas Examples Gallery

Five reference projects demonstrating TestAtlas across the major project shapes. Each example ships:

- A small, real working source codebase (50–300 LOC).
- A checked-in `_testatlas/` workspace that validates against v1 schemas.
- A `_testatlas-fixture/example-script.json` replay fixture used by `scripts/regenerate-example.js` to deterministically reproduce the workspace from source.

These examples are **not** shipped in the npm tarball — they live in this repo only and are exercised by CI on every PR. Run them locally to see what a fully-populated workspace looks like for your project shape.

| Example | Kind | Adapter set | Showcase |
|---------|------|-------------|----------|
| [nextjs-saas](./nextjs-saas/) | Next.js 15 App Router + React 19 | All 7 | UI exploration, page/route/component mapping, auth flow |
| [node-api](./node-api/) | Express 5 ESM API | All 7 | API exploration, endpoint mapping, mock-auth security findings |
| [cli-tool](./cli-tool/) | Commander 14 CLI | **Aider-only** | Capability-aware degradation; `confidence: needs-validation` |
| [monorepo](./monorepo/) | pnpm workspaces (web + api + shared) | All 7 | Per-app workspace orchestration; cross-cut flows in root `_testatlas/` |
| [mobile-web-hybrid](./mobile-web-hybrid/) | Expo SDK 52+ Router | All 7 | Universal RN+web mapping; structure-only (not built in CI) |

## Regenerating an example

Each example workspace can be byte-deterministically reproduced from its source + replay fixture:

```sh
# From the repo root
node scripts/regenerate-example.js examples/<name>
```

To verify CI-clean (regenerate to a tmp dir and diff against checked-in):

```sh
node scripts/regenerate-example.js examples/<name> --check
```

Determinism is enforced by the env-var contract documented in [scripts/lib/determinism.js](../scripts/lib/determinism.js): `TESTATLAS_DETERMINISTIC=1`, `TESTATLAS_FIXED_TIMESTAMP=<iso>`, sorted readdir, hash-derived IDs.

## Per-example notes

### [nextjs-saas](./nextjs-saas/)

A minimal Next.js 15 SaaS surface: marketing landing, auth flow, a billing dashboard, and a settings page. Demonstrates how `/atlas:explore-ui` maps the App Router to a route + component graph, how `/atlas:explore-codebase` derives domains (`auth`, `billing`, `settings`) from the directory structure, and how `/atlas:test-flow` documents the canonical signup-to-billing flow.

```sh
node scripts/regenerate-example.js examples/nextjs-saas
```

See `examples/nextjs-saas/_testatlas/13_quality_scorecard.md` for the workspace's quality summary.

### [node-api](./node-api/)

An Express 5 ESM API with mock auth, a small REST surface, and intentional security findings (e.g., a route missing rate-limiting). Demonstrates `/atlas:explore-api` endpoint mapping, `/atlas:explore-security` finding the rate-limit gap, and the issue → evidence → retest flow.

```sh
node scripts/regenerate-example.js examples/node-api
```

See `examples/node-api/_testatlas/13_quality_scorecard.md`.

### [cli-tool](./cli-tool/)

A Commander 14 CLI used to prove **capability-aware degradation** (EX-07 + VAL-02). This example ships an Aider-only adapter set — no `.claude/`, `.cursor/`, `.kilo/`, or `.opencode/` trees. Findings carry `confidence: needs-validation` because Aider lacks browser/MCP capabilities; the bootstrap rule mandates the suffix.

```sh
node scripts/regenerate-example.js examples/cli-tool
```

See `examples/cli-tool/_testatlas/13_quality_scorecard.md` for how a "degraded" run still produces actionable structure.

### [monorepo](./monorepo/)

A pnpm-workspaces monorepo (`apps/web` + `apps/api` + `packages/shared`) with the **hybrid per-app + root** workspace pattern documented in [docs/MONOREPO.md](../docs/MONOREPO.md). Each app has its own `_testatlas/`; the repo root has a cross-cut `_testatlas/` for findings that span both apps.

```sh
node scripts/regenerate-example.js examples/monorepo
node scripts/validate-workspace.js --all-workspaces examples/monorepo
```

See `examples/monorepo/_testatlas/13_quality_scorecard.md` (root) and the per-app scorecards under `apps/web/_testatlas/` and `apps/api/_testatlas/`.

### [mobile-web-hybrid](./mobile-web-hybrid/)

An Expo SDK 52+ universal Router app sharing screens between iOS/Android and web. The `_testatlas/` workspace is structure-only (we do not run iOS/Android builds in CI; that's a maintainer-local activity).

```sh
node scripts/regenerate-example.js examples/mobile-web-hybrid
```

See `examples/mobile-web-hybrid/_testatlas/13_quality_scorecard.md`.

## Adding a new example

The framework documentation lives at [examples/framework/README.md](./framework/README.md). Briefly:

1. Create `examples/<your-name>/` with a small source codebase.
2. Hand-author `_testatlas-fixture/example-script.json` (validates against `.testatlas/schemas/example-script.schema.json`).
3. Run `node scripts/regenerate-example.js examples/<your-name>` to materialize the workspace.
4. Run `node scripts/validate-workspace.js --workspace examples/<your-name>/_testatlas` and confirm exit 0.
5. Add a row to the gallery table above and a per-example sub-section.
6. Add a CI matrix entry in `.github/workflows/e2e-smoke.yml`.

See [docs/MONOREPO.md](../docs/MONOREPO.md) if your new example is multi-app.
