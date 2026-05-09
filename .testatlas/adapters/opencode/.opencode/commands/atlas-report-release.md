---
description: Render a release readiness report with go/no-go assessment combining quality_scores.json, drift.json, open issues, and council consolidations into _testatlas/reports/release_readiness.md.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/report/report-release.md" hash="5a0a7a30126ad8dd94af9b703881d0dbb66b47f23292f0e70af82b6b7e69669a" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-report-release.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Render the canonical release readiness report — a go / conditional / no-go assessment plus the supporting evidence — into `_testatlas/reports/release_readiness.md`. The report combines:

- Verdict (go / conditional / no-go) computed from PRD §7.16 thresholds (e.g., `max critical issues = 0`, `min flow_coverage_score >= 60`, `max drift = stable`, `min council_consensus_score >= 70`).
- Blocking items (open critical/high issues, stale_requires_review drift records, unresolved disagreements).
- Quality summary table (all 11 metrics, freshness, confidence).
- Drift snapshot.
- Open retest packs.
- Outstanding council decisions.
- Steps required to flip from no-go to go.

## When to Run

- Before any release tag.
- During the `council-release-readiness` session.
- On a schedule before each milestone review.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/quality_scores.json` (run `brain-score` first if missing or stale).
- `_testatlas/brain/drift.json` (run `brain-drift` first if missing or stale).
- `.testatlas/agents/councils/council_templates/release-readiness.json` for the threshold rubric.

## Required Actions

1. Verify `quality_scores.json` and `drift.json` are fresh (ages <= 1 day for release decisions). Halt with a `STALE_INPUTS` warning if either is older than the threshold.
2. Compute the verdict per PRD §7.16:
   - **go** — zero critical issues, no `stale_requires_review` drift, council_consensus_score >= 70, flow_coverage_score >= 60, security_privacy_confidence_score >= 70.
   - **conditional** — at most 3 high issues with documented mitigations, possibly_stale drift only, all other thresholds met.
   - **no-go** — any critical issue, OR any `stale_requires_review` drift, OR security_privacy_confidence_score < 50.
3. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-report.js --kind release-readiness` to render the file. The renderer fills the TESTATLAS:GENERATED markers in `_testatlas/reports/release_readiness.md`.
4. **Fallback path (no `shell`):**
   - Hand-render the file using `.testatlas/templates/reports/release_readiness.md` as the skeleton. Embed the disclaimer from `quality_scores.json` verbatim. Mark every score `confidence: needs-validation` because hand-rendered totals are not deterministic.
5. Append a brain event with `command: report-release` and the verdict.
6. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`)
- shell (preferred path)
- file-write (`_testatlas/reports/release_readiness.md` only)

## Capability Degradation

`shell` unavailable → hand-render via the template; the verdict block must explicitly state `Confidence: needs-validation — hand-rendered`. Do NOT publish a `go` verdict from the fallback path.

## Verdict Calculation (locked formula)

```
critical_issues             = count(issues where severity == 'critical' AND status != 'closed')
high_issues                 = count(issues where severity == 'high' AND status != 'closed')
high_issues_with_mitigation = count(issues where severity == 'high' AND status != 'closed' AND mitigation_documented == true)
stale_drift                 = count(drift_records where drift_status == 'stale_requires_review')
flow_score                  = quality_scores.flow_coverage_score
council_score               = quality_scores.council_consensus_score
security_score              = quality_scores.security_privacy_confidence_score

# Hard no-go gates (any one trips the verdict).
if critical_issues > 0 OR stale_drift > 0 OR security_score < 50: verdict = "no-go"

# Conditional gate codifies the prose contract: "at most 3 high issues
# with documented mitigations". A high-issue count above 3 OR any
# unmitigated high issue forces conditional. Score-floor thresholds
# (flow / council) also trip conditional.
else if (high_issues > 3) OR (high_issues > 0 AND high_issues_with_mitigation < high_issues) OR flow_score < 60 OR council_score < 70: verdict = "conditional"

# Go iff zero unresolved escalation risks, every high issue is
# mitigated, and all score-floors are met.
else: verdict = "go"
```

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the readiness verdict (`go` / `conditional` / `no-go`) and the produced report path.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new `reports/release_readiness.md` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing the report.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.reports`.
- `_testatlas/history/run_log.md` — narrative entry: "Release readiness `<verdict>` — `<critical>` critical, `<high>` high, drift `<status>`, council consensus `<n>`."

## Outputs

- `_testatlas/reports/release_readiness.md` (TESTATLAS:GENERATED markers re-rendered).
- Brain event + lifecycle close.

## Stop Conditions

- `quality_scores.json` or `drift.json` missing → halt; the operator must run `brain-score` and `brain-drift` first.
- Verdict computed without fresh inputs → publish report with `Confidence: needs-validation` banner; never publish a `go` verdict on stale inputs.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command report-release --actor agent --summary "Published release report with readiness verdict" --status completed` (or `--status aborted` with the error code).

## Completion Criteria

- `_testatlas/reports/release_readiness.md` exists on disk after the run with the `TESTATLAS:GENERATED` markers re-rendered.
- The rendered report carries one of the three verdicts (`go` / `conditional` / `no-go`) and the verdict matches the deterministic computation rule in the Required Actions section.
- The five lifecycle files (`03_execution_status.md`, `09_artifact_index.md`, `10_command_log.md`, `11_workspace_manifest.json`, `history/run_log.md`) are updated per the Lifecycle section, with `counts.reports` incremented and `lastUpdatedAt` bumped.
- A `command-result.schema.json`-shaped row is appended to `_testatlas/10_command_log.md` referencing the published report.
- Zero stop conditions triggered (`quality_scores.json missing`, `drift.json missing`, stale-input `go`-verdict block all clear; stale inputs surface a `Confidence: needs-validation` banner instead of fabricating freshness).

## What's Next


Now that the release verdict is published:

- **`/atlas:log-issue`** — if the verdict is `no-go` or `conditional` due to newly surfaced blockers, file each blocker as an issue via `/atlas:log-issue` so it can be tracked to resolution. Existing issues that already exist in `_testatlas/to_fix/` do not need to be re-logged.

- **`/atlas:handoff`** — package the workspace for the next operator now that the release report is final.
- **`/atlas:cleanup`** — prune transient artifacts before handoff.
- **`/atlas:council-release-readiness`** — escalate to a council if the release verdict is contested.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
