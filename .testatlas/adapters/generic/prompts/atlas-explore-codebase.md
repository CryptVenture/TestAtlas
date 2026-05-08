<!-- TestAtlas command: atlas-explore-codebase. Paste .testatlas/bootstrap.md first; description: Map the target product across languages, frameworks, monorepo layout, apps/services/workers, routes, handlers, jobs, integrations, and data flows; produce 12_app_map.json plus a domain inventory. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-codebase.md" hash="52ec7a82b3764feba4b51719af13f0beb4fad8c35660538cae58cd20fe7be44f" -->
First read `.testatlas/bootstrap.md`. Then read `prompts/atlas-explore-codebase.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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
- **output-format:** `12_app_map.json` validating against `app-map.schema.json`, plus an `01_system_map.md` stub. Every entry cites at least one evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** All scoped surface area enumerated; every entry cites on-disk evidence; `app-map.schema.json` validation passes; coverage gaps explicitly listed.

## Required Actions

0. **Short-circuit on already-mapped state.** If `_testatlas/12_app_map.json` is non-stub (any one of its 11 surface arrays — `domains`, `routes`, `components`, `apis`, `cliCommands`, `jobs`, `integrations`, `entities`, `flows`, `tests`, `relationships` — is non-empty) AND its most recent evidence directory at `_testatlas/evidence/explore-codebase/<timestamp>/` exists AND no source files in `git ls-files` have a modification time newer than the evidence directory's mtime, exit with `status: already-mapped` and update `10_command_log.md` only — do NOT regenerate the app-map or capture new evidence. The operator can force a refresh by deleting the most recent evidence directory.
1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Detect language(s), frameworks, build tools, test runners, linters, monorepo layout (workspaces / apps / packages / services). If `shell` is available, run `git ls-files` and parse package manifests, then derive routing surfaces from real signals: search `app/**/page.tsx`, `app/**/route.ts`, and `pages/**/*.tsx` for Next.js; run `rails routes` for Rails; run `php artisan route:list` for Laravel; parse `Express` / `Fastify` / `Koa` route registrations for Node frameworks; etc. **If `shell` is unavailable, mark findings `confidence: needs-validation` per `bootstrap.md` §4 and read package + route files manually instead — never invent routes, handlers, or integrations from training-data priors.**
3. Enumerate apps / services / workers: frontends (web, mobile, desktop), HTTP APIs, RPC services, background workers, schedulers, queue consumers, cron jobs, edge functions, lambdas. Record entry-point file paths and runtime metadata for each.
4. Enumerate routes: HTTP routes (REST, GraphQL endpoints, server actions), RPC handlers, WebSocket / SSE handlers, page routes, server-side rendered routes, static routes. Capture method, path, source-file path, and handler symbol.
5. Enumerate handlers and the modules they call into. Record handler-to-module edges so coverage and ownership reasoning can use them later.
6. Enumerate jobs / cron / queues / consumers: scheduler definitions, queue topics, consumer groups, retry policies as written in code.
7. Enumerate external integrations: auth, payments, email, SMS, analytics, telemetry, object storage, search, feature flags, webhooks, outbound APIs. Distinguish sandbox vs production endpoints whenever the codebase makes the distinction (env names, base URLs, key prefixes); never guess.
8. Enumerate data-flow surfaces: databases, caches, ORM models, schema definitions, migration files, seed scripts, fixtures. Capture model names, table names, and the file path that defines them.
9. Save raw evidence under `_testatlas/evidence/explore-codebase/<timestamp>/`: file listings, parsed manifest dumps, route enumerations, framework-introspection output, dependency graphs. Each evidence file gets a stable name so claims can cite it.
10. Render `_testatlas/12_app_map.json` per `app-map.schema.json` — every app, route, handler, job, integration, model, and dependency entry MUST reference at least one evidence path created in step 9.
11. Append a domain-inventory stub to `_testatlas/01_system_map.md` (or the analogous canonical file) listing the apps and a first-pass clustering hint for `map-domains` to consume.
12. Validate the resulting `12_app_map.json` against `app-map.schema.json`. If validation fails, halt and surface the AJV errors verbatim — do not commit a partial map.
13. Close the lifecycle (next section).

## Outputs

- `_testatlas/12_app_map.json` — schema-valid app map with apps, routes, handlers, jobs, integrations, models, dependencies, each citing evidence paths.
- `_testatlas/evidence/explore-codebase/<timestamp>/` — raw evidence directory: file listings, manifest dumps, route enumerations, framework-introspection output, dependency listings.
- Updated `_testatlas/01_system_map.md` — domain-inventory stub for `map-domains` to consume.
- Updated runtime-detection metadata recorded in `_testatlas/00_overview.md` (language, framework, package manager).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, and counts of apps / routes / integrations discovered.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new evidence directory and `12_app_map.json` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (This command does not write to `counts.*` — those track per-domain/flow/issue/evidence/run artifacts that explore-codebase does not produce. Run `node .testatlas/scripts/sync-status.js` if downstream commands have populated counts that need reconciling against on-disk reality.)
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` apps, `<n>` routes, `<n>` integrations into `12_app_map.json`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-codebase --actor agent --summary "Mapped codebase routing surfaces and dependency graph" --status completed --reindex`.

## Stop Conditions

- Target repo is not a recognizable codebase (no package manifests, no recognizable source files) → halt with `Target repo lacks recognizable manifests; explorer cannot proceed.` Do not invent a structure.
- `shell` AND read-only filesystem access both unavailable → halt; this command cannot operate without at least one source-of-truth path into the target repo.
- More than 5000 routes detected from a single source → halt and surface as a stop condition; this is almost certainly a parser false-positive (e.g. a regex-generated route table) and should be reviewed before being committed to the map.
- `app-map.schema.json` validation fails on the produced JSON → halt; do not commit a malformed map. Re-run after fixing the source data.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- `_testatlas/12_app_map.json` exists and validates against `app-map.schema.json`.
- Every app, route, handler, job, integration, and model entry cites at least one evidence path under `_testatlas/evidence/explore-codebase/<timestamp>/` that exists on disk.
- `_testatlas/01_system_map.md` lists at least one app (or unambiguous justification for zero).
- Manifest `lastUpdatedAt` is bumped; `counts.*` is left untouched (this command produces no countable per-domain/flow/issue/evidence/run artifacts).
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the app map is built:

- **`/atlas:explore-ui`** — observe runtime UI states for the routes you just inventoried
- **`/atlas:explore-api`** — exercise the HTTP surface and capture endpoint evidence
- **`/atlas:plan`** — turn the inventory into a test plan if exploration is sufficient
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
