---
name: atlas-validate-workspace
description: Schema-validate the _testatlas/ workspace; surface drift, broken links, orphaned evidence, and other PRD §33 violations as findings.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/validate-workspace.md" hash="a6888e376673429d0bc025a41fd2bf83d204cd8879dd7dde612a7b202c1961db" -->
First read `.testatlas/bootstrap.md`. Then read `.kiro/skills/atlas-validate-workspace.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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
12. **Auxiliary drift checks (if `shell` is available — preferred path).** Run two complementary scripts whose findings fold into the validation report:
    - `node .testatlas/scripts/check-org-placeholder.js` — exits non-zero if the literal placeholder string (the documented `org`-substitution token in pre-publish docs) is found anywhere in active repo files (excludes node_modules, .git, .planning, dist, coverage, .testatlas.bak.*). Surface each match as a finding under "drift: pre-publish placeholder leak" in the validation report.
    - `node .testatlas/scripts/check-stale-docs.js [--threshold-days 90]` — flags workspace markdown files older than threshold (honors `archival: true` frontmatter and `config.staleDocs.archivalDirs`). Surface flagged paths as `confidence: needs-validation` findings under PRD §33 condition 8 (stale generated content adjacent rule).
13. Append the validation findings as a markdown report under `_testatlas/reports/validation-report-<timestamp>.md`, grouped by PRD §33 rule number.
14. Close the lifecycle (next section).

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

- `_testatlas/11_workspace_manifest.json` missing → halt; print `Workspace not initialized; run /atlas:core-init first.`
- More than 50 critical findings → halt; require operator review before continuing the session per `bootstrap.md` §24.
- Schema files missing under `.testatlas/schemas/` → halt; the suite is corrupted and must be reinstalled.
- Manifest fails its own schema validation → halt; refuse to validate downstream artifacts against a broken manifest.
- If manifest `schema_version` is `1.x` on a V2 suite, halt and run `/atlas:maintain-migrate` to upgrade workspace artifacts to V2 layout.

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
- **`/atlas:core-brain-validate`** — V2 brain-layer validation that complements V1 schema validation.
- **`/atlas:maintain-migrate`** — if validation flags `schema_version: 1.x` on a V2 suite, run migration.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
