---
command: validate-workspace
version: 1.0.0
description: Schema-validate the _testatlas/ workspace; surface drift, broken links, orphaned evidence, and other PRD §33 violations as findings.
capabilities: [shell, file-write]
produces: []
consumes:
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Default mode surfaces findings only; pass --auto-heal (CLI) or set autoHeal=true (programmatic) to repair safely-fixable findings. Does NOT delete artifacts. Does NOT modify _testatlas/ except for lifecycle records and an optional report file.
---

# TestAtlas Command: validate-workspace

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

Schema-validate every artifact under `_testatlas/`, detect drift between the workspace manifest and on-disk state, and surface every PRD §33 violation as a finding the operator can act on. The validator runtime ships with the suite. Two reachable invocation paths:

1. **Preferred (always works):** `npx @webventures/testatlas validate`
2. **In-tree (requires the @webventures/testatlas package locally installed):** `node .testatlas/scripts/validate-workspace.js`

Use the manual fallback below only when shell capability is unavailable. `--auto-heal` is opt-in and surfaces findings without writing unless `--apply` is also passed.

## Required First Reads

- `.testatlas/bootstrap.md` — constitution; lifecycle and stop-condition rules.
- `_testatlas/11_workspace_manifest.json` — the manifest under audit.
- `.testatlas/schemas/*.schema.json` — the 16 schemas to validate against.
- `_testatlas/09_artifact_index.md` — declared artifact set; cross-checked against on-disk reality.

## Required Actions

1. **Preferred path (if `shell` is available):** run `npx @webventures/testatlas validate` (or `node .testatlas/scripts/validate-workspace.js` when the package is locally installed). Pass `--auto-heal --apply` to repair safely-fixable findings in place. If `shell` is unavailable, mark findings `confidence: needs-validation` per `bootstrap.md` §4 and read files manually instead — items 2–11 below describe each check the runtime performs.
2. **Canonical files present (PRD §33 condition 1):** confirm `_testatlas/00_overview.md` through `_testatlas/13_quality_scorecard.md` exist; surface a finding for each missing file. This is the schema validity check on the canonical 14-file set.
3. **JSON Schema validity (PRD §33 condition 2):** for every JSON artifact (`_testatlas/11_workspace_manifest.json`, `app_map.json`, `domains/<slug>/domain.json`, `flows/<slug>/flow.json`, `to_fix/ISSUE-*.json`, `evidence/<id>/manifest.json`, `runs/<run-id>/run.json`, `reports/<id>/report.json`), validate against the matching schema in `.testatlas/schemas/`. Surface every AJV error verbatim — do not paraphrase.
4. **Broken links (PRD §33 condition 3):** every markdown cross-reference whose target is a relative path (e.g. `[text](some-relative-path.md)`) resolves to an on-disk file or anchor inside `_testatlas/`.
5. **Orphaned evidence (PRD §33 condition 4):** every `_testatlas/evidence/<id>/<file>` is referenced by at least one issue or run record. Unreferenced evidence is a finding (likely stale; do not delete in v1).
6. **Issue index consistency (PRD §33 condition 5):** the per-domain issue indexes (`_testatlas/domains/<slug>/issues.md`), per-severity indexes (`_testatlas/to_fix/by_severity/*.md`), and per-status indexes (`_testatlas/to_fix/by_status/*.md`) all match the actual issue files on disk.
7. **Missing domain/flow indexes (PRD §33 condition 6):** every domain directory under `_testatlas/domains/` has its `index.md`; every flow directory under `_testatlas/flows/` has its state-coverage index.
8. **Duplicate IDs (PRD §33 condition 7):** no two issues, flows, domains, or evidence files share an ID. Allocation collisions indicate manifest corruption.
9. **Stale generated sections (PRD §33 condition 8):** sections wrapped in `<!-- TESTATLAS:GENERATED:START section="..." -->` markers have content hashes matching the manifest's recorded `generatedSections` hash (PRD §14.11 + WORK-07). Do not overwrite when hashes diverge — WARN only.
10. **Modified-generated-content (PRD §33 condition 9):** WARN on hash mismatch and surface the specific file + section. Per WORK-07, hash-based detection is preferred over textual diffs.
11. **Status / count mismatches:** the manifest's `counts.{domains,flows,issues,evidence,runs,reports}` equal the on-disk counts. Re-derive from disk and surface deltas.
12. Append the validation findings as a markdown report under `_testatlas/reports/validation-report-<timestamp>.md`, grouped by PRD §33 rule number.
13. Close the lifecycle (next section).

## Outputs

- `_testatlas/reports/validation-report-<timestamp>.md` — markdown report listing all findings by category. Each entry cites the artifact path and the specific PRD §33 rule violated.
- Updated `_testatlas/09_artifact_index.md` reflecting the post-validation truth.
- No changes to domain / flow / issue / evidence artifacts — `boundary` forbids it.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record validation pass/fail and finding count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` with the report path.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; do not mutate counts unless re-derivation surfaced a delta.
- `_testatlas/history/run_log.md` — narrative summary including count of findings by severity.

## Stop Conditions

- `_testatlas/11_workspace_manifest.json` missing → halt; print `Workspace not initialized; run /atlas:init first.`
- More than 50 critical findings → halt; require operator review before continuing the session per `bootstrap.md` §24.
- Schema files missing under `.testatlas/schemas/` → halt; the suite is corrupted and must be reinstalled.
- Manifest fails its own schema validation → halt; refuse to validate downstream artifacts against a broken manifest.

## Completion Criteria

- Validation report exists at `_testatlas/reports/validation-report-<timestamp>.md`.
- Every finding cites a PRD §33 rule by number.
- Manifest counts re-derived and recorded; `lastUpdatedAt` bumped.
- The five lifecycle files listed above are updated.
- No stop condition triggered.

## What's Next

Now that the workspace is validated:

- **`/atlas:explore`** — proceed with discovery if validation passed clean
- **`/atlas:cleanup`** — archive resolved findings if validation surfaced drift
- **`/atlas:update`** — refresh the suite if the report flagged a stale version
