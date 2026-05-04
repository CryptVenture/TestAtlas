---
name: atlas-init
description: Bootstrap the _testatlas/ workspace tree in a target repository — 23 subdirs, 14 canonical files, and a project manifest — idempotently.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/init.md" hash="2c07ff358adece3f" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Bootstrap the `_testatlas/` workspace tree in the target repository: 23 top-level + nested subdirs, 14 canonical files, and a manifest that records project metadata, ISO-8601 timestamps, and `status: initialized`. The result is a durable quality-intelligence layer the next agent (or engineer) can pick up without prior knowledge of the application stack.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution; rules-of-engagement.
- `.testatlas/default.config.json` — workspace defaults (`workspaceDir`, `safeMode`).
- The target repository's `package.json` / `pyproject.toml` / `Cargo.toml` (whichever is present) for runtime detection metadata that lands in `app_map.json`.

## Required Actions

1. **Preferred path (if `shell` is available):** run `node scripts/init-workspace.js` from the target repo root. The script is idempotent — fresh repos report `status: initialized`; previously-initialized repos report `status: already-initialized` and write nothing; partial workspaces are filled in non-destructively (`status: partial-fill`).
2. **Fallback path (if `shell` is unavailable):** mark the run `confidence: needs-validation` per `bootstrap.md` §4 because shell-derived runtime detection is unavailable. Then perform the layout manually: create `_testatlas/` plus the 23 top-level subdirectories per PRD §8. Copy each `.testatlas/templates/canonical/<file>` to `_testatlas/<file>` (14 canonical files). Render `_testatlas/11_workspace_manifest.json` with `initializedAt` and `lastUpdatedAt` set to the current ISO-8601 timestamp, `status: initialized`, project name from the target repo, and zeroed `counts` for domains/flows/issues/evidence/runs/reports.
3. Validate the resulting manifest against `.testatlas/schemas/workspace-manifest.schema.json`. If validation fails, halt and surface the AJV errors verbatim.
4. Append the run record (command, started/finished timestamps, status, capability set used) to `_testatlas/history/run_log.md`.
5. Close the lifecycle (next section).

## Outputs

- `_testatlas/` directory tree: 23 top-level subdirs (`domains/`, `flows/`, `evidence/`, `to_fix/`, `reports/`, `history/`, `tests/`, `runs/`, ...).
- 14 canonical markdown files: `00_overview.md`, `01_product_understanding.md`, `02_personas.md`, `03_execution_status.md`, ..., `13_quality_scorecard.md`.
- `_testatlas/11_workspace_manifest.json` — schema-valid manifest with project metadata + counts + `generatedSections` hash map.
- A seeded `_testatlas/app_map.json` placeholder (filled in by `explore-codebase`).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute counts.
- `_testatlas/history/run_log.md` — narrative log entry for this run.

## Stop Conditions

- `.testatlas/` suite tree missing → halt with `Run testatlas install first.`
- Existing `_testatlas/` whose manifest does not validate against `workspace-manifest.schema.json` → halt; refuse to recreate without explicit `--force`.
- Target repo path is not writable → halt; refuse to proceed silently.
- `safeMode: true` and any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- `_testatlas/11_workspace_manifest.json` exists, validates, records `status: initialized` (or `already-initialized` / `partial-fill`).
- All 14 canonical files exist on disk.
- A subsequent `validate-workspace` run reports zero errors.
- The five lifecycle files listed above are updated.

## What's Next

Now that the workspace is bootstrapped:

- **`/atlas:validate-workspace`** — confirm schemas + manifest are clean before any exploration
- **`/atlas:explore`** — start mapping the product (umbrella router; spawns sub-explorers in parallel when `subagent-spawn` is available)
- **`/atlas:bootstrap`** — re-load the constitution if you suspect context drift
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
