---
command: report-domain
version: 2.0.0
description: Render a domain-scoped report combining quality scores, issues, coverage, drift, and recommendations into _testatlas/reports/domain-<slug>.md.
capabilities: [shell, file-write]
produces:
  - command-result
  - report
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify domain source files. Reads `_testatlas/brain/quality_scores.json`, `domains.json`, `flows.json`, `issues.json`, `drift.json`. Writes a single rendered report at `_testatlas/reports/domain-<slug>.md`.
---

# TestAtlas Command (V2 report): report-domain

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/state.json`, `_testatlas/brain/quality_scores.json`, `_testatlas/brain/domains.json`, `_testatlas/brain/flows.json`, `_testatlas/brain/issues.json`, `_testatlas/brain/drift.json`.
4. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Produce a focused, human-readable report for a single domain. The report combines:

- The current `quality_scores.json` filtered to metrics that involve this domain.
- The list of flows in the domain (from `flows.json`) with their tested / drift status.
- Open and recently closed issues that affect this domain.
- Drift records that intersect the domain.
- Coverage snapshot (routes / components / endpoints touching the domain).
- Recommended next actions.

## When to Run

- Before reviewing a domain in a council session.
- Before assigning a domain owner.
- When triaging issues by domain.
- On a schedule (e.g., weekly per-domain digest).

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/quality_scores.json` (run `brain-score` first if missing or stale).
- `_testatlas/brain/drift.json` (run `brain-drift` first if missing or stale).

## Required Actions

1. Resolve target domain: from CLI arg `--domain <slug>` or operator-supplied parameter. Halt if the slug is not in `domains.json`.
2. Read the canonical brain inputs.
3. **Preferred path (if `shell` available):**
   - Run `node scripts/generate-report.js --kind domain --domain <slug>` (existing V2 generator) which composes the report from `quality_scores.json` + domain-scoped slices of the other indexes.
4. **Fallback path (no `shell`):**
   - Render `_testatlas/reports/domain-<slug>.md` by hand using `.testatlas/templates/reports/quality_scores.md` as the section skeleton.
5. Mark every score `confidence: needs_validation` if `quality_scores.json` has not been refreshed in the current session.
6. Always include the disclaimer string from `quality_scores.json` verbatim at the top of the rendered report.
7. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`)
- shell (preferred path)
- file-write (`_testatlas/reports/domain-<slug>.md` only)

## Capability Degradation

`shell` unavailable → hand-render via the template; flag every section that requires aggregation (drift x score correlation) as `needs-validation`.

## Outputs

- `_testatlas/reports/domain-<slug>.md` (one file per invocation).
- Brain event + lifecycle close.

## Stop Conditions

- `quality_scores.json` missing → halt with instruction to run `brain-score`.
- Domain slug not found in `domains.json` → halt with `DOMAIN_NOT_FOUND`.

## Update Brain After Command

Run `node scripts/update-brain-after-command.js --command report-domain --status success`.
