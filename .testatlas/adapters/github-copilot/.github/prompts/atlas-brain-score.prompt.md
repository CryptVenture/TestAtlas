---
mode: agent
description: Compute the 11 PRD §7.15 quality scores from documented brain evidence and write _testatlas/brain/quality_scores.json with freshness + confidence + disclaimer.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/brain/brain-score.md" hash="12cdc7a904f3bc9ae5cbbbe8b190f06b0ad05d65c52960b7e96ac71b55b043bd" -->
First read `.testatlas/bootstrap.md`. Then read `.github/prompts/atlas-brain-score.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Compute the 11 PRD §7.15 quality scores from documented brain state and write them to `_testatlas/brain/quality_scores.json`. Each metric is a deterministic function of brain JSON files (no LLM judgment, no randomness). Re-running on the same brain produces the same score.

## When to Run

- After `/atlas:explore` populates a domain or flow.
- Before `/atlas:report release` so the readiness report has fresh scores.
- After a council consolidates findings.
- After `brain-sync` reconciles markdown→JSON drift.
- On a schedule (e.g., nightly CI).

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`
- `_testatlas/brain/state.json`

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/score-quality.js`. Add `--category <name>` to compute a single metric (`domain`, `flow`, `evidence`, `issue`, `test`, `ux`, `a11y`, `perf`, `security`, `freshness`, `council`).
   - The script atomically writes `_testatlas/brain/quality_scores.json` with `schema_version`, `last_updated`, `disclaimer`, and a `scores[]` array.
   - On error, halt and surface the script exit code.
2. **Fallback path (no `shell`):**
   - Read each brain JSON listed above.
   - Compute the 11 metrics by hand using the rubrics in PRD §7.15 — record each as `{ metric, score, evidence_refs, freshness, confidence, computed_at }`.
   - Write `quality_scores.json` with the same shape via file-write.
3. Append a brain event with `command: brain-score` and the resulting top-line scores for telemetry continuity.
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`)
- shell (preferred path)
- file-write (atomic write to `_testatlas/brain/quality_scores.json`; lifecycle close; optional generated-marker sections inside the report template)

## Capability Degradation

`shell` unavailable → use the fallback path; mark every score `confidence: needs_validation` because hand-computed rubrics are not byte-deterministic.

## Score Interpretation

The 11 metrics are **triage signals**, not absolute truth. A score of 100 means every check the brain knows how to perform passed; it does NOT mean the system is bug-free. A score of 0 means the brain has no evidence of coverage; it does NOT mean the system is broken.

Each record carries:

- `score` — integer 0-100.
- `evidence_refs` — IDs of the brain records that contributed to the score (e.g., issue IDs, evidence IDs, domain IDs). Use these for drilldown.
- `freshness` — `fresh` (≤7 days), `stale` (8-30 days), `unknown` (no timestamp). Stale scores should be re-computed before relying on them.
- `confidence` — `confirmed` (high score + ≥3 evidence refs), `strong_suspect` (intermediate signal), `needs_validation` (low coverage or hand-computed). Never present a `needs_validation` score as decisive.
- `computed_at` — ISO-8601 timestamp.

The output document carries a top-level `disclaimer` field. Re-render it verbatim in any human-facing report.

## Outputs

- `_testatlas/brain/quality_scores.json` (validates against `quality_score.schema.json`).
- Updated `_testatlas/reports/quality_scores.md` (only when `report` is invoked; this command does not regenerate it).
- Brain event + lifecycle close.

## Stop Conditions

- Brain directory missing → halt with `BRAIN_MISSING`; the operator must run `/atlas:core-init` first.
- Schema validation failure on the written file → halt; do NOT publish a partial scores file.
- Unknown `--category` → halt with the list of valid categories.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-score --status success` (or `--status failure` with the error code).

## What's Next

Now that the workspace has been scored:

- **`/atlas:report-dashboard-data`** — materialize dashboard data from the score you just computed.
- **`/atlas:report-release`** — produce a V2 release report incorporating quality scores.
- **`/atlas:report`** — V1 readiness report; reads `brain/quality_scores.json`.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
