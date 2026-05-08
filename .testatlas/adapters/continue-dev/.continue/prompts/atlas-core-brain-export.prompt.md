---
name: atlas-core-brain-export
description: Export the V2 brain as a JSON dump, a graph snapshot, or a full archive — for handoff, dashboards, or backup.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-export.md" hash="6610df67ae8223ac1a03d947f55a57df63c45d9d58df1fcbde0826c35634892a" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-core-brain-export.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Produce a portable export of the brain so it can be handed to another agent, fed into a dashboard, or backed up off-repo. Three modes:

- `--mode json` (default): a single dashboard-data.json validated against `dashboard_data.schema.json`.
- `--mode graph`: a graph snapshot from `brain/graph.json` with relationship metadata.
- `--mode archive`: a full archive (every brain file + canonical artifacts) under `_testatlas/exports/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/state.json`
- `_testatlas/brain/manifest.json`

## Required Actions

1. Validate the brain first via `node .testatlas/scripts/validate-brain.js` — never export an invalid brain.
2. Based on `--mode`:
   - `json`: aggregate `state.json` + `issues.json` + `coverage.json` + `quality_scores.json` into a `dashboard_data.json` shape; AJV-validate against `dashboard_data.schema.json`; atomic-write to `_testatlas/exports/dashboard-data.json` (or `--output`). <!-- output-deferred: per-mode export covered by `_testatlas/exports/` umbrella in Outputs -->
   - `graph`: copy `brain/graph.json` to the output path (default `_testatlas/exports/graph-<timestamp>.json`). <!-- output-deferred: per-mode export covered by `_testatlas/exports/` umbrella in Outputs -->
   - `archive`: copy every file under `_testatlas/brain/` plus canonical artifacts into `_testatlas/exports/<timestamp>/`.
3. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`, atomic write on `_testatlas/exports/`)
- shell (validate-brain pre-flight)
- file-write (atomic writes to the export path; lifecycle close)

## Capability Degradation

`shell` unavailable → skip the pre-flight validate-brain run, mark `needs-validation`. Export still runs.

## Outputs

- One file or directory under `_testatlas/exports/` (per `--mode`).
- Lifecycle close + brain event recording the export path.

## Stop Conditions

- Brain validation finds errors → REFUSE to export until they are resolved (run `/atlas:core-brain-sync` then `/atlas:core-brain-validate`).
- Output path already exists and `--force` not specified → halt to avoid overwrite.

## Completion Criteria

- The export artifact exists at the declared output path.
- Schema-validated when applicable (mode=json).
- Lifecycle artifacts updated.
- A `command_completed` event recorded.

## Lifecycle

Run `node .testatlas/scripts/update-brain-after-command.js --command core-brain-export --actor agent --summary "Exported brain: <mode>" --artifacts-written <export path>`. The export path is captured in the event so handoff to another agent has an audit trail; the standard 5 lifecycle artifacts are updated by the hook.

## What's Next

- `--mode json` → feed the file into a dashboard; pair with **`/atlas:report-dashboard-data`** to refresh the canonical dashboard.
- `--mode archive` → ship the directory to the next agent or back up off-repo; follow with **`/atlas:handoff`** to package the workspace.
- After export, run **`/atlas:core-brain-sync`** to ensure the live brain stays in lockstep with what was exported.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
