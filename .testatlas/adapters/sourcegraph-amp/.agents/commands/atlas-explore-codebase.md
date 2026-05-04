<!-- TestAtlas command: atlas-explore-codebase. Invoke as /atlas-explore-codebase. Description: Map the target product across languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, and data flows; produce 12_app_map.json plus a domain inventory. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-codebase.md" hash="3974af7f58cde9b5" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the target product's implementation across languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, data flows, and external dependencies. Produce `_testatlas/12_app_map.json` (validates against `app-map.schema.json`) and a domain inventory that `map-domains` will distill into per-domain artifacts. Every recorded entry MUST cite an evidence file path under `_testatlas/evidence/explore-codebase/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/11_workspace_manifest.json` — to confirm initialization status and current counts.
- `.testatlas/schemas/app-map.schema.json` — the output contract this command must satisfy.
- The target repository's package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`, etc.).
- The target repository's `README.md` if present — for high-level context only; verify every claim against actual code.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Map the target product's implementation surface — languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, models, dependencies — into `12_app_map.json`.
- **scope:** All source directories tracked by version control (default: `git ls-files` set); excludes `node_modules/`, `vendor/`, `dist/`, `build/`, `_testatlas/` workspace, and any directories listed in `.gitignore`.
- **files-to-read:** Package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`); framework route files; the target's `README.md`; existing `12_app_map.json` if present.
- **output-format:** `12_app_map.json` validating against `app-map.schema.json`, plus an `01_app_inventory.md` stub. Every entry cites at least one evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** All scoped surface area enumerated; every entry cites on-disk evidence; `app-map.schema.json` validation passes; coverage gaps explicitly listed.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Detect language(s), frameworks, build tools, test runners, linters, monorepo layout (workspaces / apps / packages / services). If `shell` is available, run `git ls-files`, parse package manifests, and run framework introspection commands (e.g. `next routes`, `rails routes`, `php artisan route:list`) where the toolchain ships them. **If `shell` is unavailable, mark findings `confidence: needs-validation` per `bootstrap.md` §4 and read package files manually instead — never invent routes, handlers, or integrations from training-data priors.**
3. Enumerate apps / services / workers: frontends (web, mobile, desktop), HTTP APIs, RPC services, background workers, schedulers, queue consumers, cron jobs, edge functions, lambdas. Record entry-point file paths and runtime metadata for each.
4. Enumerate routes: HTTP routes (REST, GraphQL endpoints, server actions), RPC handlers, WebSocket / SSE handlers, page routes, server-side rendered routes, static routes. Capture method, path, source-file path, and handler symbol.
5. Enumerate handlers and the modules they call into. Record handler-to-module edges so coverage and ownership reasoning can use them later.
6. Enumerate jobs / cron / queues / consumers: scheduler definitions, queue topics, consumer groups, retry policies as written in code.
7. Enumerate external integrations: auth, payments, email, SMS, analytics, telemetry, object storage, search, feature flags, webhooks, outbound APIs. Distinguish sandbox vs production endpoints whenever the codebase makes the distinction (env names, base URLs, key prefixes); never guess.
8. Enumerate data-flow surfaces: databases, caches, ORM models, schema definitions, migration files, seed scripts, fixtures. Capture model names, table names, and the file path that defines them.
9. Save raw evidence under `_testatlas/evidence/explore-codebase/<timestamp>/`: file listings, parsed manifest dumps, route enumerations, framework-introspection output, dependency graphs. Each evidence file gets a stable name so claims can cite it.
10. Render `_testatlas/12_app_map.json` per `app-map.schema.json` — every app, route, handler, job, integration, model, and dependency entry MUST reference at least one evidence path created in step 9.
11. Append a domain-inventory stub to `_testatlas/01_app_inventory.md` (or the analogous canonical file) listing the apps and a first-pass clustering hint for `map-domains` to consume.
12. Validate the resulting `12_app_map.json` against `app-map.schema.json`. If validation fails, halt and surface the AJV errors verbatim — do not commit a partial map.
13. Close the lifecycle (next section).

## Outputs

- `_testatlas/12_app_map.json` — schema-valid app map with apps, routes, handlers, jobs, integrations, models, dependencies, each citing evidence paths.
- `_testatlas/evidence/explore-codebase/<timestamp>/` — raw evidence directory: file listings, manifest dumps, route enumerations, framework-introspection output, dependency listings.
- Updated `_testatlas/01_app_inventory.md` — domain-inventory stub for `map-domains` to consume.
- Updated runtime-detection metadata recorded in `_testatlas/00_overview.md` (language, framework, package manager).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, and counts of apps / routes / integrations discovered.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new evidence directory and `12_app_map.json` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.apps`, `counts.routes`, `counts.integrations`, `counts.models`.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` apps, `<n>` routes, `<n>` integrations into `12_app_map.json`."

## Stop Conditions

- Target repo is not a recognizable codebase (no package manifests, no recognizable source files) → halt with `Target repo lacks recognizable manifests; explorer cannot proceed.` Do not invent a structure.
- `shell` AND read-only filesystem access both unavailable → halt; this command cannot operate without at least one source-of-truth path into the target repo.
- More than 5000 routes detected from a single source → halt and surface as a stop condition; this is almost certainly a parser false-positive (e.g. a regex-generated route table) and should be reviewed before being committed to the map.
- `app-map.schema.json` validation fails on the produced JSON → halt; do not commit a malformed map. Re-run after fixing the source data.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- `_testatlas/12_app_map.json` exists and validates against `app-map.schema.json`.
- Every app, route, handler, job, integration, and model entry cites at least one evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/` that exists on disk.
- `_testatlas/01_app_inventory.md` lists at least one app (or unambiguous justification for zero).
- Manifest `counts.apps`, `counts.routes`, `counts.integrations`, `counts.models` are updated to match the on-disk map.
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the app map is built:

- **`/atlas:explore-ui`** — observe runtime UI states for the routes you just inventoried
- **`/atlas:explore-api`** — exercise the HTTP surface and capture endpoint evidence
- **`/atlas:plan`** — turn the inventory into a test plan if exploration is sufficient
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
