---
command: explore
version: 1.1.0
description: Umbrella explorer orchestrator — classifies sub-explorers, spawns the recommended ones in parallel via subagent-spawn, and aggregates findings into _testatlas/02_product_overview.md alongside _testatlas/explore-plan.md.
capabilities: [file-write]
produces:
  - command-result
consumes:
  - app-map
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Spawns recommended sub-explorers in parallel via the host's subagent-spawn capability when available; aggregates findings into _testatlas/02_product_overview.md alongside the routing record at _testatlas/explore-plan.md. Does NOT write evidence — children own their evidence directories.
---

# TestAtlas Command: explore

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `./_testatlas/11_workspace_manifest.json` if it exists.
4. Inspect the canonical files required by this command.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Route the agent to the right subset of sub-explorers AND orchestrate their parallel execution. This umbrella reads the existing app map and product surface signals, classifies each PRD §13 / §6.5 explorer as `recommended`, `optional`, or `skip`, and — when the host declares the `subagent-spawn` capability — spawns the recommended non-cached children in parallel via the Agent tool. After children return, it aggregates their structured findings into `_testatlas/02_product_overview.md` and writes the routing-decision record to `_testatlas/explore-plan.md`. Children own their evidence under `_testatlas/evidence/<child-name>/<timestamp>/`; the umbrella links to those paths in the overview's child-results-table but never writes evidence itself.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §3 (precedence) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — produced by `explore-codebase`; the primary input. If absent, halt and recommend running `/atlas:explore-codebase` first.
- `_testatlas/11_workspace_manifest.json` — to confirm initialization status and surface counts.
- The target repository's package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) — to corroborate the app-map's product-surface signals.

## Required Actions

1. Read `_testatlas/12_app_map.json`. If absent, halt with: "Run `/atlas:explore-codebase` first — the umbrella explorer requires an app map." Do NOT invent surface signals.
2. Detect product surface area from app-map signals: presence of UI (web routes/pages, frontend frameworks), CLI (binaries/scripts, `bin` entries in manifests), HTTP API (route count > 0; REST/GraphQL/RPC handlers), data persistence (models/migrations/schemas), external integrations (auth/payment/email/analytics SDKs).
3. Classify each PRD §13 / §6.5 explorer as `recommended`, `optional`, or `skip` based on the detected surface. Examples: a CLI-only tool → `skip` for `explore-ui` and `explore-accessibility`; a static site without backend → `skip` for `explore-data` and `explore-integrations`; every product → `recommended` for `explore-codebase`, `explore-docs`, `explore-runtime`, `explore-security`.
4. **Idempotency filter.** For each recommended child, check `_testatlas/evidence/<child-name>/<timestamp>/`. If a successful evidence dir exists with a timestamp under 1 hour old AND no source-file mtime drift since (same heuristic as F-10 explore-codebase short-circuit), mark the child `cached` and skip its spawn. Record cached children in the overview's child-results-table with a link to the existing evidence dir.
5. **Select `executionMode`** per host capability and non-cached recommended count:
   - `subagent-spawn` available + ≥2 non-cached recommended children → `parallel-subagents`.
   - `subagent-spawn` available + exactly 1 non-cached recommended child → `single-spawn-inline` (degenerate spawn = inline execution).
   - `subagent-spawn` unavailable + sequential capability available + ≥2 non-cached recommended children → `sequential-fallback`.
   - `subagent-spawn` unavailable + no sequential mode → `classify-only` (degraded — record on the run, surface as a coverage-gap).
   - 0 non-cached recommended children (all cached or all skip) → `no-op`.
6. **Spawn children** per the selected mode using the host's invocation pattern from `bootstrap.md` Capability Degradation. Pass each child the 6-slot brief defined in the Sub-Agent Orchestration section below.
7. **Aggregate** child findings into `_testatlas/02_product_overview.md` with 5 generated sections, each wrapped in `<!-- TESTATLAS:GENERATED:START section="..." -->` / `<!-- TESTATLAS:GENERATED:END section="..." -->` markers per the `00_overview.md` / `01_system_map.md` convention: `executive-summary`, `surface-matrix`, `child-results-table`, `coverage-gaps`, `last-updated`.
8. Write the routing record `_testatlas/explore-plan.md` with the classification, recommended invocation order (suggested baseline: codebase → docs → runtime → data → api → ui → integrations → cli → accessibility → performance → security), per-skip rationale, and time-budget estimates (small / medium / large) per recommended sub-explorer.
9. **Failure handling.** If a spawned child halts, record the halt in the child-results-table with `status:halted` plus the child's error code; surface the child's coverage as a gap under `coverage-gaps`. The umbrella halts ONLY if every spawned child halts. Run `status:ok` when ≥1 child completed; `status:partial` when ≥1 halt + ≥1 ok; `status:failed` only when every child halted.
10. Close the lifecycle (next section).

## Sub-Agent Orchestration

This umbrella is a spawn-and-aggregate orchestrator. When the host declares the `subagent-spawn` capability (per `bootstrap.md` Capability Degradation), the umbrella spawns each recommended non-cached child in parallel via the Agent tool and aggregates their structured findings into `_testatlas/02_product_overview.md`. See Required Actions step 5 for the full `executionMode` selection logic; the 5 enum values are `parallel-subagents`, `single-spawn-inline`, `sequential-fallback`, `classify-only`, and `no-op`.

The applicable child task pool is `{explore-codebase, explore-ui, explore-cli, explore-api, explore-docs, explore-runtime, explore-data, explore-integrations, explore-accessibility, explore-performance, explore-security}`, filtered by the classification produced in Required Actions step 3 and the idempotency filter in step 4.

**Per-child brief contract** (the placeholder `[child]` stands for the chosen sub-explorer name like `codebase`, `ui`, `api`, etc.):

- **objective:** "Map the [domain] surface area of the target product."
- **scope:** "Files and runtime artifacts in scope of the [child] command."
- **files-to-read:** ".testatlas/commands/explore-[child].md plus the product files relevant to [domain]."
- **output-format:** "Structured markdown matching the explore-[domain] finding schema fragment, or JSON if the host prefers; one finding per discovered surface."
- **may-write:** "the child writes only to its own evidence directory `_testatlas/evidence/[child]/[timestamp]/`; the umbrella never grants additional write paths."
- **exit-criteria:** "All scoped surface area enumerated; coverage gaps explicitly listed."

**Aggregation clause.** After spawned children return (parallel) or complete (sequential-fallback), the umbrella reads each child's evidence directory and synthesizes findings into the 5 generated sections of `_testatlas/02_product_overview.md`. Cached children skip respawn and appear in the child-results-table with `status:cached` linking to their existing evidence dir.

**Failure clause.** Partial halts surface as `coverage-gaps`; full halt means every recommended non-cached child halted (rare).

## Outputs

- `_testatlas/explore-plan.md` — classification + routing-decision record (recommended/optional/skip per explorer + invocation order + per-skip rationale + time-budget estimates).
- `_testatlas/02_product_overview.md` — aggregate product overview synthesizing child findings. 5 generated sections (`executive-summary`, `surface-matrix`, `child-results-table`, `coverage-gaps`, `last-updated`) each wrapped in `TESTATLAS:GENERATED:START/END` markers per the `00_overview.md` / `01_system_map.md` convention.
- The umbrella does NOT write to `_testatlas/evidence/` — children own their evidence under `_testatlas/evidence/<child-name>/<timestamp>/`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order. (The two command-specific outputs `_testatlas/explore-plan.md` and `_testatlas/02_product_overview.md` are written by Required Actions steps 7-8 and are referenced from the lifecycle files below.)

- `_testatlas/03_execution_status.md` — record current command + completion state and the paths to `explore-plan.md` and `02_product_overview.md`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (`explore-plan.md` and `02_product_overview.md` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run; set `executionMode` to the selected mode.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Do NOT alter `counts.*` — this command produces no countable schema artifacts.
- `_testatlas/history/run_log.md` — narrative entry: "Routed `<n>` recommended / `<n>` optional / `<n>` skipped sub-explorers in `explore-plan.md`; aggregated `<m>` child findings into `02_product_overview.md` (executionMode: `<mode>`)."

## Stop Conditions

- `_testatlas/12_app_map.json` absent OR contains zero entries across all 11 surface arrays (`domains`, `routes`, `components`, `apis`, `cliCommands`, `jobs`, `integrations`, `entities`, `flows`, `tests`, `relationships`) → halt with the explore-codebase recommendation. The umbrella cannot classify without surface signals.
- The umbrella itself attempts to write a schema artifact (`route`, `component`, `evidence`, `issue`, etc.) → halt; those are children's responsibility, not the umbrella's. The umbrella may only write the two markdown artifacts (`explore-plan.md`, `02_product_overview.md`) and the standard lifecycle files.
- `safeMode=true` and a step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Filesystem is read-only and the command cannot write `_testatlas/explore-plan.md` OR `_testatlas/02_product_overview.md` → halt; this command requires `file-write`.
- Every spawned non-cached child halts on its own stop condition → halt with all child error codes surfaced. Partial child halts are NOT a stop condition — they surface as `coverage-gaps` and the run records `status:partial`.

## Completion Criteria

- `_testatlas/explore-plan.md` exists; lists every PRD §13 / §6.5 explorer with a classification.
- `_testatlas/02_product_overview.md` exists; contains all 5 generated sections each wrapped in `TESTATLAS:GENERATED` markers.
- At least 1 recommended child completed successfully (or unambiguous justification recorded if `executionMode` landed at `classify-only` / `no-op`).
- The 5 lifecycle files updated (`03_execution_status.md`, `09_artifact_index.md`, `10_command_log.md`, `11_workspace_manifest.json`, `history/run_log.md`) plus the 2 command-specific outputs (`explore-plan.md`, `02_product_overview.md`).
- `10_command_log.md` row records `executionMode` matching the selected mode.
- Zero stop conditions triggered.

## What's Next

Now that the explore-plan is routed and the product overview aggregated:

- **`/atlas:map-domains`** — group explorer findings into testable domains
- **`/atlas:plan`** — design the test plan (skip map-domains if your scope is small)
- **`/atlas:test-flow`** — start executing flows immediately if scope is already clear
