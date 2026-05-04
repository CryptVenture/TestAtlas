---
mode: agent
description: Umbrella explorer router — classify which sub-explorers (ui/cli/api/docs/runtime/data/integrations/accessibility/performance/security) apply to the target product and emit a recommendation document.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore.md" hash="72c53ca6328e27ff" -->
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

- `_testatlas/12_app_map.json` absent → halt with the explore-codebase recommendation. The umbrella cannot classify without an app map.
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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
