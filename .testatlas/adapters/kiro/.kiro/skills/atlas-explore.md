---
name: atlas-explore
description: Umbrella explorer router — classify which sub-explorers (ui/cli/api/docs/runtime/data/integrations/accessibility/performance/security) apply to the target product and emit a recommendation document.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore.md" hash="e6d5106ae5f8acbc" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Route the agent to the right subset of sub-explorers for the target product. This command is the umbrella orchestrator — it reads the existing app map and product surface signals, classifies each PRD §13 / §6.5 explorer as `recommended`, `optional`, or `skip`, and writes a recommendation document at `_testatlas/explore-plan.md`. It is **non-finding-producing**: it does NOT write to `_testatlas/evidence/`, does NOT produce `app-map`, `domain`, `route`, `component`, or any other schema artifact, and does NOT invoke the sub-explorers it recommends. The operator (or a follow-up command) executes the recommended explorers.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §3 (precedence) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — produced by `explore-codebase`; the primary input. If absent, halt and recommend running `/atlas:explore-codebase` first.
- `_testatlas/11_workspace_manifest.json` — to confirm initialization status and surface counts.
- The target repository's package manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) — to corroborate the app-map's product-surface signals.

## Required Actions

1. Read `_testatlas/12_app_map.json`. If absent, halt with: "Run `/atlas:explore-codebase` first — the umbrella explorer requires an app map." Do NOT invent surface signals.
2. Detect product surface area from app-map signals: presence of UI (web routes/pages, frontend frameworks), CLI (binaries/scripts, `bin` entries in manifests), HTTP API (route count > 0; REST/GraphQL/RPC handlers), data persistence (models/migrations/schemas), external integrations (auth/payment/email/analytics SDKs).
3. Classify each PRD §13 / §6.5 explorer as `recommended`, `optional`, or `skip` based on the detected surface. Examples: a CLI-only tool → `skip` for `explore-ui` and `explore-accessibility`; a static site without backend → `skip` for `explore-data` and `explore-integrations`; every product → `recommended` for `explore-codebase` (already shipped), `explore-docs`, `explore-runtime`, `explore-security`.
4. Write `_testatlas/explore-plan.md` listing the classification, the recommended invocation order (suggested baseline: codebase → docs → runtime → data → api → ui → integrations → cli → accessibility → performance → security), and a one-line rationale per skipped explorer.
5. Estimate a time budget per recommended sub-explorer (small / medium / large) based on the count of routes / endpoints / integrations the app map records.
6. Close the lifecycle (next section).

## Sub-Agent Orchestration (advisory, classification-only)

This command's contract is to classify and write `_testatlas/explore-plan.md` only. It does NOT spawn or merge sub-explorer results — that's the responsibility of a follow-up sub-explorer invocation (e.g. `/atlas:explore-codebase`, `/atlas:explore-ui`, `/atlas:explore-api`) or a future orchestrator command that explicitly produces a product overview. When the operator chains the recommended explorers, the host's `subagent-spawn` capability (per `bootstrap.md` Capability Degradation) lets them run in parallel; but spawning is not this command's job.

Recording for completeness: applicable child task pool is `{explore-codebase, explore-ui, explore-cli, explore-api, explore-docs, explore-runtime, explore-data, explore-integrations, explore-accessibility, explore-performance, explore-security}`, filtered by the classification produced in step 3.

When the operator (or a downstream orchestrator) invokes a recommended sub-explorer, the brief contract that explorer expects is — for reference only (the placeholder `[child]` below stands for the chosen sub-explorer name like `codebase`, `ui`, `api`, etc.):

- **objective:** "Map the [domain] surface area of the target product."
- **scope:** "Files and runtime artifacts in scope of the [child] command."
- **files-to-read:** ".testatlas/commands/explore-[child].md plus the product files relevant to [domain] (routes, handlers, manifests, config)."
- **output-format:** "Structured markdown matching the explore-[domain] finding schema fragment, or JSON if the host prefers; one finding per discovered surface."
- **may-write:** the child writes only to the paths its own command file authorizes; this umbrella never grants additional write paths.
- **exit-criteria:** "All scoped surface area enumerated; coverage gaps explicitly listed."

Mark the run record `executionMode: 'classify-only'` regardless of host capability — this command produces no aggregate output.

## Outputs

- `_testatlas/explore-plan.md` — recommendation document only. Lists classification, invocation order, time-budget estimates, and per-skip rationale.
- No schema artifacts. No evidence files. No findings. No app-map mutations.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state and the path to `explore-plan.md`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new `explore-plan.md` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Do NOT alter `counts.*` — this command produces no countable artifacts.
- `_testatlas/history/run_log.md` — narrative entry: "Routed `<n>` recommended / `<n>` optional / `<n>` skipped sub-explorers in `explore-plan.md`."

## Stop Conditions

- `_testatlas/12_app_map.json` absent OR contains zero entries across all 11 surface arrays (`domains`, `routes`, `components`, `apis`, `cliCommands`, `jobs`, `integrations`, `entities`, `flows`, `tests`, `relationships`) → halt with the explore-codebase recommendation. The umbrella cannot classify without surface signals.
- Any required step would write to `_testatlas/evidence/` → halt; this command is non-finding-producing and MUST NOT emit evidence.
- Any required step would produce a schema artifact (`app-map`, `domain`, `route`, `component`, `evidence`, `issue`, etc.) → halt; the umbrella's only output is the recommendation markdown.
- `safeMode=true` and a step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Filesystem is read-only and the command cannot write `_testatlas/explore-plan.md` → halt; this command requires `file-write`.

## Completion Criteria

- `_testatlas/explore-plan.md` exists and lists every PRD §13 / §6.5 explorer with a classification.
- Recommended invocation order documented.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.
- No evidence files, no schema artifacts, no findings emitted.

## What's Next

Now that the explore-plan is routed:

- **`/atlas:map-domains`** — group explorer findings into testable domains
- **`/atlas:plan`** — design the test plan (skip map-domains if your scope is small)
- **`/atlas:test-flow`** — start executing flows immediately if scope is already clear
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
