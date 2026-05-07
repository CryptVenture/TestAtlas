<!-- TestAtlas command: atlas-report. Invoke as /atlas-report.md. Description: Aggregate runs, issues, evidence, and coverage into reports/REPORT-latest.md (and a timestamped copy) with all 17 PRD §20 sections; refresh per-area views and the quality scorecard. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/report.md" hash="967efad38f3f9c8d8b567e48bd6406335e4c7bd37221d233f5a200ca7c441916" -->
First read `.testatlas/bootstrap.md`. Then read `.clinerules/workflows/atlas-report.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Aggregate runs, issues, evidence, and coverage into `_testatlas/reports/REPORT-latest.md` (validates against `report.schema.json`) plus a timestamped historical copy. Produce all 17 PRD §20 sections; refresh per-area views (`regressions.md`, `readiness.md`, `coverage.md`, `quality_risks.md`); refresh `_testatlas/13_quality_scorecard.md`. The report is the operator's primary read-out; every claim it carries MUST trace back to an existing run, issue, or evidence file.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §8 (no-evidence-no-finding) and §11 (claim-confidence).
- `_testatlas/tests/runs/RUN-*.json` — every run since the last report (used for run/coverage aggregation).
- `_testatlas/to_fix/*.json` — every issue, indexed by severity / status / type / confidence.
- `_testatlas/12_app_map.json` and `_testatlas/domains/*/domain.json` — coverage denominators (apps / routes / domains / flows).
- The previous `_testatlas/reports/REPORT-*.md` if any — for the trend-vs-prior section (last section).
- `.testatlas/schemas/report.schema.json` — required JSON shape and section list.

## Required Actions

1. **Preferred path (if `shell` is available):** run `node .testatlas/scripts/generate-report.js [--report-path=<custom>] [--workspace <p>] [--dry-run]`. The script aggregates every `tests/runs/RUN-*.json` and `to_fix/ISSUE-*.json` on disk, computes coverage denominators from `12_app_map.json` and `domains/*/domain.json`, AJV-validates the produced JSON against `report.schema.json` BEFORE write, and halts with `TESTATLAS_MISSING_EVIDENCE_REF` if any cited evidence path does not resolve on disk (no-evidence-no-finding enforced at report-generation time). On success, the script writes both `REPORT-latest.{md,json}` and a timestamped historical copy. The four per-area views (`regressions.md`, `readiness.md`, `coverage.md`, `quality_risks.md`) and `13_quality_scorecard.md` are still refreshed by the manual steps below — skip step 13 only. **Manual path (no `shell`):** items 2–16 below describe each step the runtime performs.
2. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
3. Aggregate runs: counts by type (smoke / user-flow / exploratory / regression / negative / state / accessibility / performance / security / data-integrity per PRD §26), pass/fail/skipped/blocked tallies, capabilities used, capabilities unavailable, environment fingerprints. Cite each contributing `RUN-<timestamp>.json` by path.
4. Aggregate issues: by severity (critical / high / medium / low / enhancement) and by confidence (confirmed / strong-suspect / needs-validation) per PRD §28. Cite each contributing issue id and its evidence chain.
5. Compute coverage: domains explored (denominator: total domains in `12_app_map.json`); flows tested (denominator: total flows in `_testatlas/flows/`); state coverage (empty / loading / error / success / permission per PRD §13) as exercised by runs; test types run (denominator: PRD §26 ten types). Express each as `<exercised>/<total>` plus a percentage.
6. Identify blockers: issues whose severity is `critical` AND confidence is in {`confirmed`, `strong-suspect`}. Identify regressions: issues whose `type=regression`. List both with evidence paths.
7. Produce gaps (untested high-risk areas — domains/flows with zero runs but high route counts or sandbox-vs-production integrations) and assumptions (claims marked `confidence: needs-validation` per `bootstrap.md` §11).
8. Produce risks: performance regressions (PRD §13.10), security risks (§13.11), state-coverage holes, integration-environment ambiguities, capability-degradation residue.
9. Capabilities used / unavailable: aggregate from each run's frontmatter and from any `confidence: needs-validation` markers across the workspace.
10. Generate next actions: for each gap and blocker, propose the next command (`/atlas:retest issue=ISSUE-<id>`, `/atlas:explore-ui domain=<slug>`, `/atlas:test-flow scenario=<id>`). Each next action must cite the gap or blocker it addresses.
11. Generate readiness assessment: a single-line judgement — `ship-ready`, `needs-work`, or `blocked` — backed by the severity and coverage tallies above. Do not soften the call; cite the specific tallies that drove it.
12. Compute trend vs prior REPORT: issue-velocity (new / resolved / re-opened since prior), severity-shift (critical/high count delta), coverage delta (domains/flows/states/types delta). If no prior REPORT exists, mark this section "baseline".
13. Write `_testatlas/reports/REPORT-latest.md` (overwrite) and a copy as `_testatlas/reports/REPORT-<timestamp>.md` (append-only history). The JSON sidecar at `_testatlas/reports/REPORT-latest.json` validates against `report.schema.json`.
14. Refresh `_testatlas/reports/regressions.md`, `_testatlas/reports/readiness.md`, `_testatlas/reports/coverage.md`, `_testatlas/reports/quality_risks.md`, and `_testatlas/13_quality_scorecard.md` to match the new aggregation.
    - **Preferred path for scorecard refresh (if `shell` is available):** run `node .testatlas/scripts/sync-scorecard.js [--workspace <p>] [--dry-run]` to regenerate the 5 generated sections of `13_quality_scorecard.md` (coverage, severity-weighted-issue-load, confidence-trend, blockers-trend, last-updated) from manifest counts + on-disk `to_fix/ISSUE-*.json` + `tests/runs/`; the script also refreshes `manifest.generatedSections['13_quality_scorecard.md']` hashes in lockstep.
15. Validate the produced JSON against `report.schema.json` before closing. If validation fails, halt — do not commit a malformed report.
16. Close the lifecycle (next section).

## Outputs

- `_testatlas/reports/REPORT-latest.md` — narrative report with all 17 PRD §20 sections in order: (1) Run summary; (2) Coverage; (3) Domains explored; (4) Flows tested; (5) Tests run by type; (6) Key findings; (7) Severity breakdown; (8) Confidence breakdown; (9) Blockers; (10) Regressions; (11) Gaps; (12) Assumptions; (13) Risks; (14) Capabilities used / unavailable; (15) Next actions; (16) Readiness assessment; (17) Trend (vs prior REPORT).
- `_testatlas/reports/REPORT-latest.json` — schema-valid sidecar matching `report.schema.json`.
- `_testatlas/reports/REPORT-<timestamp>.md` — historical immutable copy.
- Refreshed `_testatlas/reports/regressions.md`, `readiness.md`, `coverage.md`, `quality_risks.md`.
- Refreshed `_testatlas/13_quality_scorecard.md`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record report id, readiness assessment, blocker count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (new REPORT pair + timestamped copy + refreshed views).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this report.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.reports`; update `counts.scorecard`.
- `_testatlas/history/run_log.md` — narrative entry: "REPORT-`<timestamp>` — readiness `<verdict>`; `<n>` blockers, `<n>` regressions, coverage `<pct>%`."

## Stop Conditions

- No runs exist (`_testatlas/tests/runs/` empty) → halt; "Run /atlas:test-flow first." A report with zero runs has no aggregation surface.
- More than 100 runs unread since the last report → halt; require operator to confirm a full re-aggregation pass (likely indicates skipped report cycles).
- Any cited evidence file does not exist on disk → halt; do not commit a report referencing fabricated paths.
- Any cited issue id is missing from `_testatlas/to_fix/` → halt; manifest is stale and `validate-workspace` must run first.
- `report.schema.json` validation fails on the produced JSON → halt; do not commit a partial / malformed report.

## Completion Criteria

- `_testatlas/reports/REPORT-latest.md` exists with all 17 PRD §20 sections present in order.
- `_testatlas/reports/REPORT-latest.json` validates against `report.schema.json`.
- Every claim in Key Findings, Blockers, Regressions, and Risks cites an evidence path that exists on disk.
- Severity and confidence tallies match the issue-index counts on disk.
- Readiness assessment is one of {`ship-ready`, `needs-work`, `blocked`} and is backed by cited tallies.
- Trend section names a prior REPORT or is explicitly marked "baseline".
- `_testatlas/13_quality_scorecard.md` is refreshed; per-area views are refreshed.
- Manifest `counts.reports` is incremented by exactly one.
- The five lifecycle files listed above are updated.

## What's Next

Now that the report is generated:

- **`/atlas:consolidate`** — merge with prior reports for trend analysis
- **`/atlas:handoff`** — package the workspace for another agent or engineer
- **`/atlas:cleanup`** — archive resolved evidence to keep the workspace lean
- **`/atlas:council-release-readiness`** — formalize the readiness verdict via council when the report flags contested risks.
- **`/atlas:report-release`** — V2 release report incorporating quality scores and brain signals.
- **`/atlas:brain-score`** — re-score the workspace using the report's findings as input.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
