<!-- TestAtlas command: atlas-validate-workspace. Invoke as /atlas-validate-workspace.md. Description: Schema-validate the _testatlas/ workspace; surface drift, broken links, orphaned evidence, and other PRD §33 violations as findings. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/validate-workspace.md" hash="2a293570100dff8a19c6dcc06703a8beff4c1a1eccdf3c7cc6606a619211a9fb" -->
First read `.testatlas/bootstrap.md`. Then read `.clinerules/workflows/atlas-validate-workspace.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Schema-validate every artifact under `_testatlas/`, detect drift between the workspace manifest and on-disk state, and surface every PRD §33 violation as a finding the operator can act on. The validator runtime ships with the suite. Two reachable invocation paths:

1. **Preferred (always works):** `npx @webventures/testatlas validate`
2. **In-tree (requires the @webventures/testatlas package locally installed):** `node .testatlas/scripts/validate-workspace.js`

Use the manual fallback below only when shell capability is unavailable. `--auto-heal` applies fixes automatically by default (apply=true is auto-set when `--auto-heal` is present per `.testatlas/scripts/validate-workspace.js:340-346`); pass `--dry-run` alongside `--auto-heal` for surface-only mode that previews fixes without writing.

## Required First Reads

- `.testatlas/bootstrap.md` — constitution; lifecycle and stop-condition rules.
- `_testatlas/11_workspace_manifest.json` — the manifest under audit.
- `.testatlas/schemas/*.schema.json` — the canonical schema set this command validates against (count discovered at runtime by walking the directory; do not hard-code it in agent reasoning).
- `_testatlas/09_artifact_index.md` — declared artifact set; cross-checked against on-disk reality.

## Required Actions

1. **Preferred path (if `shell` is available):** run `npx @webventures/testatlas validate` (or `node .testatlas/scripts/validate-workspace.js` when the package is locally installed). Pass `--auto-heal` to repair safely-fixable findings in place; the script auto-flips `apply=true` when `--auto-heal` is set, so passing `--apply` alongside is redundant and emits a deprecation note (the standalone `--apply` flag will be removed in v2). If `shell` is unavailable, mark findings `confidence: needs-validation` per `bootstrap.md` §4 and read files manually instead — items 2–11 below describe each check the runtime performs.
2. **Canonical files present (PRD §33 condition 1):** confirm `_testatlas/00_overview.md` through `_testatlas/13_quality_scorecard.md` exist; surface a finding for each missing file. This is the schema validity check on the canonical 14-file set.
3. **JSON Schema validity (PRD §33 condition 2):** for every JSON artifact (`_testatlas/11_workspace_manifest.json`, `app_map.json`, `domains/<slug>/domain.json`, `flows/<slug>/flow.json`, `to_fix/ISSUE-*.json`, `evidence/<id>/manifest.json`, `runs/<run-id>/run.json`, `reports/<id>/report.json`), validate against the matching schema in `.testatlas/schemas/`. Surface every AJV error verbatim — do not paraphrase.
4. **Broken links (PRD §33 condition 3):** every markdown cross-reference whose target is a relative path (e.g. `[text](some-relative-path.md)`) resolves to an on-disk file or anchor inside `_testatlas/`.
5. **Orphaned evidence (PRD §33 condition 4):** every `_testatlas/evidence/<id>/<file>` is referenced by at least one issue or run record. Unreferenced evidence is a finding (likely stale; do not delete in v1).
6. **Issue index consistency (PRD §33 condition 5):** the per-domain issue indexes (`_testatlas/domains/<slug>/issues/index.md` — the canonical file emitted by `.testatlas/scripts/create-domain.js`), per-severity indexes (`_testatlas/to_fix/by_severity/*.md`), per-status indexes (`_testatlas/to_fix/by_status/*.md`), and per-flow indexes (`_testatlas/to_fix/by_flow/<flow-id>.md`) all match the actual issue files on disk.
7. **Missing domain/flow indexes (PRD §33 condition 6):** every domain directory under `_testatlas/domains/` has its `index.md` and `issues/index.md`; flows live as file pairs `_testatlas/flows/FLOW-<domain>-<slug>.{md,json}` (per `.testatlas/scripts/create-flow.js`) — flows are NOT directories — so the per-flow issue index is `_testatlas/to_fix/by_flow/<flow-id>.md`, which must exist for any flow that has at least one referencing issue.
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

The runtime (`node .testatlas/scripts/validate-workspace.js`) emits these halt surfaces; doc cites only what the script actually implements:

- **Workspace not initialized** — `_testatlas/` directory missing, or `_testatlas/11_workspace_manifest.json` missing. Script returns exit code 0 with the friendly message `Workspace not initialized; run /atlas:init first.` and runs no checks. This is a soft halt: there is nothing to validate, so the run is reported as "no work" rather than a failure.
- **Schema set unloadable** — files under `.testatlas/schemas/` cannot be read or compiled by AJV (missing directory, malformed schema JSON, duplicate `$id`, etc.). The schema-loader throws; `runCli` catches and exits 1 with `validate-workspace: <code> — <message>`. The suite is corrupted and must be reinstalled.
- **Any check returns `status: 'fail'`** — exit 1. This is the primary failure surface: AJV violations against any artifact schema, broken cross-references, orphaned evidence, duplicate IDs, count mismatches, etc. The full list is the PRD §33 check set wired in `CHECK_IDS` plus the Phase-17 `shell-capability` and `script-path` invariants.
- **Companion linter failure** — after the check set runs, the CLI also invokes `lint-commands.js` and folds its exit code into the final exit (max of the two). A non-zero linter result therefore halts the run as exit 1 even when every check passed.
- **CLI usage error** — unknown argument, or `--workspace` and `--all-workspaces` passed together → exit 2 (usage error, distinct from validation failure).

Note: there is **no** `>50 critical findings` threshold and **no** `schema_version` mismatch halt in the current implementation. A malformed manifest is *tolerated* (the parse error is swallowed at the orchestrator level so other checks can still run against a partial context); the resulting schema-validity finding from `check-schemas` is what surfaces as a fail, not a separate manifest-parse halt.

## Completion Criteria

- Validation report exists at `_testatlas/reports/validation-report-<timestamp>.md`.
- Every finding cites a PRD §33 rule by number.
- Manifest counts re-derived and recorded; `lastUpdatedAt` bumped.
- The five lifecycle files listed above are updated.
- No stop condition triggered.

## What's Next


Now that the workspace is validated:

- **`/atlas:log-issue`** — if validation findings indicate product-level defects (e.g., broken cross-references that hide real issues, orphaned evidence that removes issue backing), file issues for the underlying problems via `/atlas:log-issue`. Pure workspace-structure violations (e.g., missing canonical files) should be fixed by re-running the originating command instead.

- **`/atlas:explore`** — proceed with discovery if validation passed clean
- **`/atlas:cleanup`** — archive resolved findings if validation surfaced drift
- **`/atlas:update`** — refresh the suite if the report flagged a stale version
- **`/atlas:core-brain-validate`** — V2 brain-layer validation that complements V1 schema validation.
- **`/atlas:maintain-migrate`** — when migrating a V1 workspace to V2 layout. Note: validation does not currently auto-detect `schema_version: 1.x`; run migration when you know the workspace pre-dates V2.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
