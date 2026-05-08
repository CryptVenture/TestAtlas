<!-- TestAtlas command: atlas-consolidate. Invoke as /atlas-consolidate. Description: Squash issue duplicates per triage groupings; inherit highest severity + lowest-bound confidence; refresh _testatlas/13_quality_scorecard.md longitudinal series. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/consolidate.md" hash="d14fd5bc0df5591c96e677e97576d6e6edccec72fb100216033448e317169d6f" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-consolidate.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Apply the consolidation pass that follows triage (PRD §17, RPT-03). Squash duplicate-candidate groups identified by `triage` into a canonical issue per group, inherit the highest severity and the lowest-bound confidence across each group, merge evidence + repro alternates without dropping any reference, mark non-canonicals `closed` with `closedAs: consolidated_into=ISSUE-NNNN`, and refresh `_testatlas/13_quality_scorecard.md` with the four longitudinal series the readiness report depends on. The scorecard's history is append-only; prior entries are never rewritten or deleted, so the scorecard is auditable across runs.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `prd/prd.md` §17 (issue layer), §20 (report sections), §28 (severity / confidence vocabulary).
- `.testatlas/schemas/vocabulary.schema.json` — `severity`, `confidence`, `issueStatus`, `issueType` `$defs`.
- Every `_testatlas/to_fix/ISSUE-*.json` sidecar currently on disk.
- The most-recent `_testatlas/to_fix/triage-report-*.md` and `_testatlas/to_fix/groups.md`.
- `_testatlas/13_quality_scorecard.md` (append-only longitudinal target).
- `_testatlas/reports/coverage.md` and `_testatlas/reports/regressions.md` (severity shifts may invalidate counts).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every severity inheritance, confidence inheritance, and consolidation entry MUST cite the group-member issues whose evidence supports it. Severity that cannot be traced to a member's evidence is forbidden — refuse the inheritance and surface the group as needing manual triage.
2. Read every issue file. Read the most-recent `triage-report-*.md` and `groups.md` produced by `triage`. If neither exists, halt with `Run /atlas:triage first.` — consolidate operates on triage output, not on raw issue piles.
3. For each duplicate group from triage output, in lowest-canonical-ID order:
   1. **Pick the canonical** as the lowest-numbered ID in the group (default rule). Operators may override by passing an explicit canonical; this MUST be recorded in the canonical's history.
   2. **Severity inheritance — highest across the group.** Walk every group member's `severity` and set the canonical's `severity` to the maximum (`critical > high > medium > low > enhancement`). If any member is `critical`, the canonical becomes `critical`. Inheritance never downgrades — a `medium` canonical with a `high` duplicate becomes `high`.
   3. **Confidence lowest-bound rule.** Walk every group member's `confidence` and set the canonical's `confidence` to the minimum (`needs-validation < strong-suspect < confirmed`). If any member is `needs-validation`, the canonical becomes `needs-validation` until a subsequent retest re-confirms.
   4. **Merge evidence (uniq).** Concatenate every member's `evidence` array onto the canonical's, then deduplicate by absolute path string. Never drop an evidence reference on merge — losing a path on consolidation is the loudest possible audit failure.
   5. **Append repro alternates.** Add every duplicate's `reproductionSteps` as an alternate-repro block in the canonical's markdown body, prefixed with the source ID. The canonical's primary repro is unchanged.
   6. **Close the duplicates.** Set non-canonical members to `status: closed` with `closedAs: consolidated_into=ISSUE-NNNN` and append a history entry citing the canonical. The duplicate's content is preserved on disk; only its status flips.
4. **Refresh `_testatlas/13_quality_scorecard.md`** with these four longitudinal series, each preserved across runs via generated-section markers (Phase 2 contract — `<!-- testatlas:generated:start --> ... <!-- testatlas:generated:end -->`; human content outside markers stays intact). **Preferred accelerators (if `shell`):** run `node .testatlas/scripts/summarize-run.js` (distills RUN-*.md into `SESSION-SUMMARY-<ts>.md`) then `node .testatlas/scripts/update-indexes.js` (regenerates `09_artifact_index.md` sections).
   - **severity-weighted issue load over time** — sum (`critical`×8 + `high`×4 + `medium`×2 + `low`×1 + `enhancement`×0.5) per period.
   - **confidence distribution over time** — counts of `confirmed` / `strong-suspect` / `needs-validation` per period.
   - **resolution velocity** — issues opened per period vs. issues moved to `closed` per period (the slope is the velocity).
   - **regression rate** — count of `type: regression` issues per period as a fraction of all issues opened in that period.
5. Append a single consolidation entry to the scorecard's history block (**append-only — never delete prior entries, never edit prior entries**) capturing: ts, groups merged, evidence references rolled up, severity escalations applied, and confidence downgrades.
6. Update `_testatlas/reports/coverage.md` and `_testatlas/reports/regressions.md` to reflect the new severity counts. Severity inheritance can change a domain's blocker count — refresh both files via the same generated-section markers so human-authored prose outside the markers is preserved.
7. Re-derive per-severity, per-status, per-domain indexes under `_testatlas/to_fix/by_*/` from disk; never trust cached counts.
8. Validate every modified issue JSON against `.testatlas/schemas/issue.schema.json`. Halt on any AJV failure with the error verbatim — do not commit a malformed sidecar.
9. Close the lifecycle (next section).

## Sub-Agent Orchestration

Per `bootstrap.md` Capability Degradation:

**If `subagent-spawn` is available:**
For each independent summarization area in `{issues-by-severity, issues-by-confidence, runs-by-domain, coverage-gaps, regression-deltas}`:
  Spawn a sub-agent with this brief (markdown convention):
    - **objective:** "Summarize `<area>` across the workspace in the form ready to merge into `_testatlas/13_quality_scorecard.md`."
    - **scope:** "All artifacts under the named area (e.g., for `issues-by-severity` — every `_testatlas/to_fix/ISSUE-*.json` plus the per-severity indexes under `_testatlas/to_fix/by_severity/`)."
    - **files-to-read:** "The relevant indexes (e.g., `_testatlas/to_fix/INDEX.md`, `_testatlas/runs/RUN-*.json`, `_testatlas/reports/coverage.md`, `_testatlas/reports/regressions.md`) and the underlying records they index."
    - **output-format:** "Markdown section ready to merge into `_testatlas/13_quality_scorecard.md` between the generated-section markers, plus a JSON fragment with the longitudinal counts the umbrella appends to the scorecard's history block."
    - **may-write:** sub-agent MUST NOT write to `_testatlas/` directly; the umbrella merges all area summaries into `13_quality_scorecard.md` (preserving append-only history) and refreshes `coverage.md` + `regressions.md`.
    - **exit-criteria:** "Section is self-contained, accurate against on-disk records, and length-bounded; counts are derived from disk (never cached)."
Run all sub-agents in parallel. Wait for all to complete.
Merge structured results into the refreshed scorecard + reports.
Mark the run record `executionMode: 'parallel-subagents'`.

**Else (sequential fallback):**
For each summarization area sequentially in this thread:
  Compute the area summary inline following the brief above.
  Capture output.
Synthesize results into the umbrella output.
Mark the run record `executionMode: 'sequential-fallback'`.

**Threshold guard:** if applicable area count is `< 2` after filtering (e.g., a fresh workspace with no prior runs has only one populated series), run inline regardless of capability (degenerate single-spawn is wasted overhead).

## Outputs

- Updated `_testatlas/to_fix/ISSUE-*.{md,json}` files: canonicals carry inherited severity / confidence / merged evidence; duplicates flipped to `status: closed` with `closedAs: consolidated_into=ISSUE-NNNN`.
- Refreshed `_testatlas/13_quality_scorecard.md` with the four longitudinal series + an appended consolidation history entry (append-only).
- Refreshed `_testatlas/reports/coverage.md` and `_testatlas/reports/regressions.md` reflecting the new severity counts.
- Refreshed per-severity / per-status / per-domain indexes under `_testatlas/to_fix/by_*/`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the consolidation run, groups merged, severity escalations applied, evidence references rolled up.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the refreshed scorecard + reports + indexes must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the canonicals and the scorecard path.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; refresh `counts.issues` per status; never silently drop prior counts.
- `_testatlas/history/run_log.md` — narrative entry: "Consolidated `<g>` groups into `<c>` canonicals; `<e>` severity escalations; scorecard appended."

## Stop Conditions

- No `triage-report-*.md` or `groups.md` on disk → halt with `Run /atlas:triage first.`
- No duplicate groups from triage → close cleanly with a no-op consolidation entry; the scorecard still gets a refresh of the four longitudinal series so the time-series doesn't develop gaps.
- Would delete an issue file → refuse. Consolidation flips status to `closed`; the file stays on disk so the audit trail is intact.
- Would drop an evidence path on merge → refuse the merge for that group; surface the group for manual review.
- Would mutate prior scorecard history entries → refuse. Scorecard history is append-only.
- Schema validation against `issue.schema.json` fails on any modified sidecar → halt; do not commit malformed data.

## Completion Criteria

- Every duplicate group from triage has a canonical with inherited severity (highest), inherited confidence (lowest-bound), merged evidence (uniq), and appended repro alternates.
- Every non-canonical group member has `status: closed` and `closedAs: consolidated_into=ISSUE-NNNN`.
- `13_quality_scorecard.md` carries refreshed severity-weighted load, confidence distribution, resolution velocity, and regression rate series, plus an appended consolidation history entry.
- `coverage.md` and `regressions.md` reflect the new severity counts via generated-section markers.
- Every mutated JSON sidecar validates against `issue.schema.json`.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

- **`/atlas:report`** — fold the consolidated set into the next REPORT
- **`/atlas:handoff`** — package the workspace for another operator
- **`/atlas:core-brain-sync`** — re-index brain state after consolidation to reflect new artifacts.
- **`/atlas:core-brain-validate`** — confirm the brain layer remains coherent after consolidation.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
