---
description: V2 umbrella explorer that classifies and routes all 21 V1+V2 explorers, applies idempotency filtering, selects an execution mode (parallel-subagents / sequential-fallback / classify-only), and aggregates findings.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-all.md" hash="7d99beeb8fe39510c1d8e5197e591214ed0018890f015f24df19ff8c64d250c8" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-explore-all.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

V2 supersedes the V1 `explore.md` umbrella with full coverage of the 21-explorer pool. This command:

1. Classifies each of the 21 explorers as `recommended`, `optional`, or `skip` based on detected product surface signals.
2. Applies an **idempotency filter** so already-mapped explorers are skipped when their evidence is fresh and source files haven't drifted.
3. Selects an `executionMode` (`parallel-subagents` / `sequential-fallback` / `classify-only` / `single-spawn-inline` / `no-op`) per host capability and non-cached recommended count.
4. Spawns recommended children in parallel (via the host's `subagent-spawn`) or runs them sequentially (fallback).
5. Aggregates child findings into `_testatlas/02_product_overview.md` and writes the routing decision into `_testatlas/explore-plan.md`.
6. Aggregates per-category coverage from each child into `_testatlas/brain/coverage.json` via `node .testatlas/scripts/update-coverage.js --category all`.

## The 21-explorer pool

V1 explorers (11, retained intact in `.testatlas/commands/explore-*.md`):

- `explore-codebase` — language / framework / monorepo / app-map enumeration (foundation; required first).
- `explore-ui` — runtime UI walkthrough.
- `explore-cli` — CLI surface (`cli_commands` map).
- `explore-api` — HTTP / RPC / GraphQL surface (`endpoints` map).
- `explore-docs` — documentation surface.
- `explore-runtime` — runtime / process model.
- `explore-data` — persistence / models / migrations.
- `explore-integrations` — external services (`integrations` map).
- `explore-accessibility` — WCAG audit.
- `explore-performance` — perf trace + Core Web Vitals.
- `explore-security` — V1 security posture audit (kept for back-compat).

V2 additions (10, in `.testatlas/commands/explore/`):

- `explore-state` — 5-state matrix + transitions + recovery (`states` map).
- `explore-errors` — error boundaries + fallback UI + retry patterns.
- `explore-components` — component inventory (`components` map).
- `explore-routes` — route + guard + redirect + history map (`routes` + `pages` maps).
- `explore-jobs` — background jobs + cron + queues (`jobs` map).
- `explore-security-privacy` — V2 expansion of V1 `explore-security` with privacy axis (when running V2, prefer this over `explore-security`; both retained).
- `explore-observability` — logging + metrics + alerts + tracing.
- `explore-tests` — test inventory + coverage + flake detection.
- `explore-brain` — brain workspace consistency audit.
- `explore-release-readiness` — release blocker enumeration + go/no-go.

## Required Actions

1. **Read app-map.** If `_testatlas/12_app_map.json` is absent, halt with: "Run `/atlas:explore-codebase` first." DO NOT invent surface signals.
2. **Surface detection.** From `12_app_map.json`, detect: UI present (routes/components count > 0), CLI present (cli_commands > 0), API present (endpoints > 0), data layer (entities > 0), integrations (integrations > 0), jobs (jobs > 0).
3. **Per-explorer classification.** For each of the 21 explorers, classify based on detected surface:
   - `explore-codebase`, `explore-docs`, `explore-runtime`, `explore-brain`, `explore-release-readiness` → `recommended` (every product).
   - `explore-ui`, `explore-routes`, `explore-state`, `explore-components`, `explore-errors`, `explore-accessibility`, `explore-performance` → `recommended` if UI surface detected, else `skip`.
   - `explore-cli` → `recommended` if CLI surface detected, else `skip`.
   - `explore-api` → `recommended` if API surface detected, else `skip`.
   - `explore-data` → `recommended` if data layer detected, else `skip`.
   - `explore-integrations`, `explore-observability` → `recommended` if any integration detected, else `optional`.
   - `explore-jobs` → `recommended` if jobs detected, else `skip`.
   - `explore-security-privacy` → `recommended` (every product). When running V2, prefer this over V1 `explore-security`. V1 `explore-security` → `optional` (retained for back-compat).
   - `explore-tests` → `recommended` (every product).
4. **Idempotency filter.** For each `recommended` child, check `_testatlas/evidence/<child-name>/<latest-timestamp>/`. Apply the cache-skip rule. Cache freshness is measured against a per-run timestamp-of-last-run captured in `_testatlas/evidence/<child-name>/<latest-timestamp>/.lastrun.json` (a small JSON sidecar `{ ts: <ISO>, head: <git-rev-parse-HEAD> }` co-located with the evidence directory — the same convention `/atlas:explore-codebase` uses); compare `now - ts` to the configured TTL and check the recorded HEAD against the current `git rev-parse HEAD` for drift detection (HEAD-mismatch ⇒ source has moved ⇒ re-extract). Note: git tracks blob content, not mtimes, so file-system mtime checks are unreliable across clones — HEAD comparison is the canonical drift signal. Apply:
   - The evidence dir exists AND its sibling `.lastrun.json` `ts` is < 1 hour (`3600000` ms) old AND `head` matches current `git rev-parse HEAD` → mark child `cached`.
   - The evidence dir exists AND its `.lastrun.json` shows no HEAD drift BUT the recorded `ts` is between 1 hour (`3600000` ms) and 24 hours (`86400000` ms) old → mark child `cached` (configurable via `.testatlas/default.config.json.idempotencyTtlMs`; the config key is named with the `Ms` suffix because its value is milliseconds).
   - Otherwise → child remains `recommended` (force re-extraction with `--refresh`).
   - Items the child has already mapped (e.g. routes already in `maps/routes.json` whose source files haven't drifted) are also skipped at the **per-item** level inside the child; the umbrella flags this with `idempotency: skip-already-mapped` in the brief.
   - Cached children appear in the child-results-table with `status:cached` linking to the existing evidence dir.
5. **Select executionMode.**
   - `subagent-spawn` available + ≥2 non-cached `recommended` → `parallel-subagents`.
   - `subagent-spawn` available + exactly 1 non-cached `recommended` → `single-spawn-inline`.
   - `subagent-spawn` unavailable + sequential capability + ≥2 non-cached `recommended` → `sequential-fallback`.
   - `subagent-spawn` unavailable + no sequential mode → `classify-only` (degraded; surface as a coverage-gap).
   - 0 non-cached `recommended` → `no-op`.
6. **Spawn children.** Pass each child a 6-slot brief: `objective`, `scope`, `files-to-read`, `output-format`, `may-write`, `exit-criteria`. Children own their evidence under `_testatlas/evidence/<child-name>/<ts>/`.
7. **Aggregate.** After children return, synthesize findings into `_testatlas/02_product_overview.md` (5 generated sections wrapped in `TESTATLAS:GENERATED:START/END` markers: `executive-summary`, `surface-matrix`, `child-results-table`, `coverage-gaps`, `last-updated`). Write the routing decision to `_testatlas/explore-plan.md`.
8. **Update coverage ledger.** Run `node .testatlas/scripts/update-coverage.js --category all` after children finish so the brain coverage ledger reflects new evidence.
9. **Failure handling.** Partial-halt children → record in child-results-table with `status:halted`. Run `status:ok` if ≥1 child succeeded; `status:partial` if ≥1 halt + ≥1 ok; `status:failed` only if every child halted.
10. Close the lifecycle.

## Outputs

- `_testatlas/explore-plan.md` — routing-decision record per explorer (status + classification + cache state).
- `_testatlas/02_product_overview.md` — aggregate overview synthesizing child findings.
- Updated `_testatlas/brain/coverage.json` (via `update-coverage.js`).
- Children own their evidence under `_testatlas/evidence/<child-name>/<ts>/`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, executionMode used, child-result summary.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row with `executionMode`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Do NOT alter `counts.*` (children's responsibility).
- `_testatlas/history/run_log.md` — narrative: "Routed `<n>` recommended / `<m>` cached / `<k>` skip explorers (executionMode=`<mode>`); aggregated into `02_product_overview.md`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-all --actor agent --summary "Routed and ran explorers; aggregated into product overview" --status completed --reindex`.

## Stop Conditions

- `_testatlas/12_app_map.json` absent → halt: "Run `/atlas:explore-codebase` first."
- The umbrella attempts to write a schema artifact (route/component/issue/etc.) → halt; that's children's job.
- Filesystem is read-only and the command cannot write the two markdown artifacts → halt.
- Every spawned non-cached child halts → halt with all child error codes surfaced.

## Completion Criteria

- `explore-plan.md` exists, classifies all 21 explorers (`recommended` / `optional` / `skip`), shows cache state.
- `02_product_overview.md` exists with the 5 generated sections.
- `brain/coverage.json` refreshed via `update-coverage.js`.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next


- **`/atlas:log-issue`** — for every finding with severity `medium` or higher, file an individual issue under `_testatlas/to_fix/` using `/atlas:log-issue`. Include the evidence path captured by this command in the issue's `evidence` array. Skip findings that are purely informational (severity = `low` or `enhancement`) unless the operator requests them.

- **`/atlas:map-domains`** — group explorer findings into testable domains.
- **`/atlas:plan`** — design the test plan from the aggregated overview.
- **`/atlas:explore-release-readiness`** — turn the overview into a release decision.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
