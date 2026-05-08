---
mode: agent
description: Render a machine-readable dashboard data export (PRD §16) at _testatlas/reports/dashboard-data.json suitable for downstream UIs and CI status pages.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/report/report-dashboard-data.md" hash="7372a9ca31263ea5a604f5d3d70535b028e40935c73efff13426a32b9cd5b9ad" -->
First read `.testatlas/bootstrap.md`. Then read `.github/prompts/atlas-report-dashboard-data.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Produce the canonical machine-readable dashboard export — a pre-aggregated JSON document at `_testatlas/reports/dashboard-data.json` that downstream consumers (external dashboards, CI status pages, the optional static HTML report) can render without parsing markdown. The shape is locked by `dashboard_data.schema.json` (PRD §16) and contains:

- `schema_version` — always `"2.0.0"`.
- `generated_at` — ISO-8601 timestamp of the export.
- `project` — derived from `_testatlas/brain/manifest.json#project_name`.
- `quality_summary` — overall_score (mean of quality_scores), domains_tested / domains_total, open_critical, open_high.
- `domains[]` — id, name, score, open_issues, drift_status.
- `issues_by_severity` — critical / high / medium / low / enhancement counts.
- `council_activity` — sessions_total, sessions_last_7_days, open_decisions.
- `drift` — stale_domains[] (domains with `stale_requires_review`), drift_records_7_days.

The dashboard is a pure projection from existing brain JSON — re-running on the same brain produces byte-identical output (modulo `generated_at`). This contract is intentional: machine readers should be able to diff dashboards across CI runs without false signal.

## When to Run

- After `/atlas:brain-score` and `/atlas:brain-drift` so quality + drift signals are fresh.
- Before publishing a dashboard or release readiness report.
- On a schedule from CI as a quality status snapshot.
- After consolidating a council session that produced new decisions or risks.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`
- `_testatlas/brain/quality_scores.json` (run `/atlas:brain-score` first if missing or stale).
- `_testatlas/brain/drift.json` (run `/atlas:brain-drift` first if missing or stale).
- `_testatlas/brain/issues.json`, `domains.json`, `flows.json`, `agent_sessions.json`, `decisions.json`.

## Required Actions

1. Verify `quality_scores.json` and `drift.json` are present. If either is missing, log a warning and continue with degraded values (all scores default to 0; `stale_domains` is empty). The output is still a valid dashboard but consumers see the blanks.
2. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-dashboard-data.js --output _testatlas/reports/dashboard-data.json` (or in target repos `node .testatlas/scripts/generate-dashboard-data.js`).
   - The generator atomically writes the JSON, AJV-validates against `dashboard_data.schema.json` before write, and exits 0 on success.
3. **Fallback path (no `shell`):**
   - Hand-render the JSON using the field shape above. Validate against `.testatlas/schemas/dashboard_data.schema.json`. Mark the export as `confidence: needs-validation` in any consuming report because hand-rendered totals are not deterministic.
4. Append a brain event with `command: report-dashboard-data` and the file path.
5. Update `_testatlas/09_artifact_index.md` with the new file entry.
6. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`)
- shell (preferred path)
- file-write (`_testatlas/reports/dashboard-data.json` only)

## Output Format

The command produces exactly one file:

```
_testatlas/reports/dashboard-data.json
```

Schema-validated against `.testatlas/schemas/dashboard_data.schema.json` (PRD §16). Always carries the `schema_version: "2.0.0"` constant for downstream version negotiation.

## Downstream Consumption

- **External dashboards** can poll `dashboard-data.json` directly and render quality state without parsing markdown reports.
- **The optional static HTML report** (specification published in the suite repo's `docs/` tree) is designed to consume this exact file.
- **CI** can post the file to a status check or upload it as a build artifact for retention.

The contract is: a downstream consumer can render the full quality state from this single JSON file with zero additional brain reads.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the dashboard export path + projected counts (open critical / high / blocker).
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new `reports/dashboard-data.json` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing the export.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Dashboard exports are pure projections of brain state and are not counted in `counts.reports`.
- `_testatlas/history/run_log.md` — narrative entry: "Dashboard data exported (`<n>` domains, `<n>` open issues, drift `<status>`)."

## Stop Conditions

- Halt with `BRAIN_DIR_MISSING` if `_testatlas/brain/` does not exist.
- Halt with `DASHBOARD_SCHEMA_VIOLATION` if the projected document fails AJV validation against `dashboard_data.schema.json`. (The generator throws this before write — no partial files reach disk.)
- Halt with `BAD_FORMAT` if `--format` is not one of `json | html-preview`.

## Examples

```
# Default — write to _testatlas/reports/dashboard-data.json
node .testatlas/scripts/generate-dashboard-data.js

# Custom output path
node .testatlas/scripts/generate-dashboard-data.js --output /tmp/atlas-dashboard.json

# From a non-current cwd
node .testatlas/scripts/generate-dashboard-data.js --cwd /path/to/target-repo
```

The dashboard data export is the V2 brain machine-readable face — JSON remains canonical; everything downstream is derived.

## What's Next

Now that dashboard data is materialized:

- **`/atlas:report-release`** — produce a V2 release report consuming this dashboard data.
- **`/atlas:report`** — V1 readiness report; can ingest dashboard signals.
- **`/atlas:brain-score`** — re-score after dashboard data refresh if scoring inputs changed.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
