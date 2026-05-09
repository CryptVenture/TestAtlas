---
command: brain-drift
version: 2.0.0
description: Detect drift between the last exploration and the current repository state and write _testatlas/brain/drift.json with per-domain/flow drift status.
capabilities: [shell, file-write]
produces:
  - command-result
  - drift_record
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify code or generated artifacts. Reads git history + filesystem timestamps; writes `_testatlas/brain/drift.json` and `_testatlas/reports/drift.md` (atomic).
---

# TestAtlas Command (V2 brain): brain-drift

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/state.json`, `_testatlas/brain/manifest.json`, `_testatlas/brain/domains.json`, `_testatlas/brain/flows.json`.
4. Inspect any canonical files this command needs.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Detect drift between when each domain/flow/route was last explored and what has changed in the repository since. Writes `_testatlas/brain/drift.json` (one record per change cluster) and `_testatlas/reports/drift.md` (human-readable summary). PRD §7.16 lists the 7 drift inputs:

1. Git diff since last exploration.
2. Package lock changes (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
3. Route file changes (`routes/`, `pages/`, `app/`).
4. API schema changes (OpenAPI specs, GraphQL SDL, RPC IDLs).
5. Migration changes (migration scripts, schema files).
6. Component changes (component source files).
7. Test file changes (test/, spec/, __tests__/).

## When to Run

- Before any decision-grade report.
- After a large code change that may invalidate prior exploration evidence.
- On a schedule (CI nightly; pre-release gate).
- When `brain-score`'s `brain_freshness_score` drops below 70.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/detect-drift.js`. Optional flags: `--since <ref>` (git ref to diff against; defaults to brain's last-run timestamp), `--category {all|domains|flows|apis|routes}`, `--output <path>`.
   - The script computes git diff, watches the 7 input categories, maps changed files to affected domains/flows, assigns drift status per record (`fresh`, `possibly_stale`, `stale_requires_review`, `unknown`), and writes the JSON + report atomically.
2. **Fallback path (no `shell`):**
   - Inspect file mtimes under each input category (no git history available without `shell` — record `confidence: needs_validation` per the Capability Degradation note below).
   - Build a drift record per affected domain/flow with the same status taxonomy.
   - Write the same `drift.json` shape via file-write.
3. Append a brain event with `command: brain-drift` summarising the drift counts (fresh / possibly_stale / stale_requires_review / unknown).
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on the entire repo)
- shell (preferred path; `git`, `node`)
- file-write (`_testatlas/brain/drift.json`, `_testatlas/reports/drift.md`)

## Capability Degradation

`shell` unavailable → fall back to mtime-only detection; mark every record `confidence: needs_validation` and emit a warning that git diff coverage was skipped.

## Drift Status Meanings

- **fresh** — domain/flow explored within the last 7 days AND no relevant repo change detected.
- **possibly_stale** — explored 7-30 days ago OR minor changes detected (test edits, comment-only diffs).
- **stale_requires_review** — explored more than 30 days ago OR major changes detected (new routes, API schema diffs, migrations, lock-file bumps).
- **unknown** — no exploration history for this domain/flow; treat as `stale_requires_review` for decision purposes.

## Outputs

- `_testatlas/brain/drift.json` (each record validates against `drift_record.schema.json`).
- `_testatlas/reports/drift.md` (re-rendered TESTATLAS:GENERATED section).
- Brain event + lifecycle close.

## Stop Conditions

- Brain directory missing → halt with `TESTATLAS_BRAIN_MISSING`.
- Git not available AND `shell` declared → degrade to mtime-only and emit warning; do NOT halt.

## Lifecycle

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-drift --actor agent --summary "Computed drift signals across workspace artifacts" --status completed` (or `--status aborted` with the error code). The standard 5 lifecycle artifacts (`_testatlas/03_execution_status.md`, `_testatlas/09_artifact_index.md`, `_testatlas/10_command_log.md`, `_testatlas/11_workspace_manifest.json` `lastUpdatedAt`, `_testatlas/history/run_log.md`) are updated by the brain-update hook and the artifacts referenced under Outputs.

## What's Next


Now that drift signals are computed:

- **`/atlas:log-issue`** — if `drift_status` is `stale_requires_review` and the drift indicates a product defect (not just documentation staleness), file an issue via `/atlas:log-issue` referencing the drift record ID.

- **`/atlas:brain-score`** — score the workspace against the drift signals you just computed.
- **`/atlas:report-dashboard-data`** — assemble dashboard JSON for downstream reports.
- **`/atlas:report`** — run the V1 readiness report consuming brain drift + scores.
