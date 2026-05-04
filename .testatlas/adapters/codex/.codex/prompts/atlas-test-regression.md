<!-- TestAtlas command: atlas-test-regression. Invoke as /prompts:atlas-test-regression. Description: Re-run previously-failed scenarios from prior RUN-<timestamp>.json files; diff against the prior failed run; report regressed / recovered / unchanged / unverified per scenario. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test-regression.md" hash="bdae51dbd2cdc788" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Re-run scenarios that failed in a prior run and report whether each result has `regressed`, `recovered`, `unchanged`, or `unverified` against the baseline (PRD §26.4). The command identifies the most recent `_testatlas/runs/RUN-<timestamp>.json` containing scenarios with status `failed`, replays each previously-failed scenario, captures fresh evidence, and writes a new RUN pair tagged `type: "regression"` (per `test-run.schema.json`) plus an updated `_testatlas/reports/regressions.md`. The diff is one-directional — the prior RUN is read-only. Like every test command, this is a high fabrication-risk surface: every diff classification MUST be backed by evidence captured this run, not extrapolated from the prior one.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- The most-recent `_testatlas/runs/RUN-<timestamp>.json` whose `results[]` contains at least one `status: "failed"` entry. If the most-recent RUN is all-passing, walk back through earlier runs until one with failures is found, OR halt with `Nothing to retest.`
- `_testatlas/tests/matrix.json` — to resolve scenario id → current scenario definition (the scenario may have changed since the baseline; record both the baseline assertion and the current one).
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the regression RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every diff classification this command produces MUST cite a fresh evidence file path under `_testatlas/evidence/runs/<run-id>/<scenario-id>/regression/` that exists on disk. Inheriting the baseline's evidence paths without re-capturing is fabrication.
2. Verify capabilities. **If `shell` is unavailable, MUST NOT re-execute scenarios — mark every previously-failed scenario as `unverified: shell unavailable`, emit an empty regression run with the prior-failed list intact, add `tool_unavailable: shell` to each result per `bootstrap.md` §4, and halt the command after writing the partial RUN. Never simulate diff outcomes, exit codes, or oracle results from training-data priors.**
3. Verify safety flags. If `allowDestructiveActions=false`, refuse re-execution of any baseline-failed scenario whose steps mutate or delete data. If `allowProductionTesting=false`, inspect the resolved target URL/env name and refuse production targets. Halt rather than degrade silently.
4. **Identify the baseline.** Scan `_testatlas/runs/RUN-*.json` newest first. The baseline is the first RUN containing one or more `status: "failed"` results. Record `baselineRunId`. Build `previouslyFailedScenarios = baseline.results.filter(r => r.status === "failed")` — preserve each scenario's id, original `type`, and original assertion shape.
5. **Re-execute each previously-failed scenario.** Apply the same procedure the original test command used:
   - smoke / user-flow / exploratory → `/atlas:test-flow` procedure
   - negative / state / integration / setup-testability → `/atlas:test-domain` procedure
   - accessibility → `/atlas:test-accessibility` procedure
   - performance → `/atlas:test-performance` procedure
   Capture fresh evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/regression/`. Apply TEST-03 redaction discipline per `evidence.schema.json` — strip secrets, tokens, PII before persisting.
6. **Diff classification.** For each scenario, compare prior status to current status:
   - prior=`failed`, current=`passed` → **`recovered`**
   - prior=`failed`, current=`failed` → **`unchanged`** (still failing — note whether the failure signature is identical to the baseline, or different; if different, additionally tag `signature-drifted`)
   - prior=`passed` and reappears in this RUN as `failed` → **`regressed`** (rare here — only happens when the baseline RUN already had a mixed result for the same scenario id)
   - prior=`failed`, current=`skipped` or `blocked` due to capability or safety flag → **`unverified`**
7. Write `_testatlas/runs/RUN-<timestamp>.md` (human narrative — sectioned by classification: Recovered, Unchanged, Regressed, Unverified) and `_testatlas/runs/RUN-<timestamp>.json` with `type: "regression"`. Each result includes a `priorRunRef` field pointing to the baseline RUN id and a `priorStatus` field carrying the baseline value. Include a top-level summary: counts per classification, capabilities used, environment fingerprint.
8. Update `_testatlas/reports/regressions.md`. Preserve any human-authored content via the generated-section markers established in Phase 2 (`<!-- testatlas:generated:start -->` / `<!-- testatlas:generated:end -->`). Inside the generated block, list per-classification counts and per-scenario links to both the baseline and the current evidence directories.
9. Validate the produced RUN JSON against `test-run.schema.json` before commit. Halt if validation fails.
10. Close the lifecycle (next section).

## Outputs

- `_testatlas/runs/RUN-<timestamp>.md` and `_testatlas/runs/RUN-<timestamp>.json` — regression-typed run record with per-scenario classification, prior-run ref, and evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/regression/` — fresh per-scenario evidence captured this run.
- Updated `_testatlas/reports/regressions.md` — per-classification counts and per-scenario links.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, baseline ref, classification counts, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair, evidence directory, and updated regressions report must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id and the baseline run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by one; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (regression vs `<baselineRunId>`) — `<n>` recovered / `<n>` unchanged / `<n>` regressed / `<n>` unverified."

## Stop Conditions

- No prior RUN containing failed scenarios → halt with `Nothing to retest.`
- Baseline RUN file referenced by id but missing on disk → halt; refuse to fabricate the baseline.
- All previously-failed scenarios skipped due to missing capability → emit the partial RUN per Action 2 then halt.
- Resolved target is a production host but `allowProductionTesting=false` → halt; refuse to run.
- Evidence file referenced in a current result does not exist on disk after capture → halt; do not record a classification citing a non-existent path.
- `test-run.schema.json` validation fails on the produced JSON → halt; do not commit a malformed run.

## Completion Criteria

- Every scenario in `previouslyFailedScenarios` has exactly one classification: `recovered`, `unchanged`, `regressed`, or `unverified`.
- Every recorded classification cites a fresh evidence path that exists on disk under `_testatlas/evidence/runs/<run-id>/`.
- The regression RUN JSON validates against `test-run.schema.json` and every result includes `priorRunRef` and `priorStatus`.
- `_testatlas/reports/regressions.md` is updated inside its generated-section markers; human content outside the markers is preserved.
- Manifest `counts.runs` and `counts.evidence` are updated to match disk.
- The five lifecycle files listed above are updated.

## What's Next

Now that the regression run is complete:

- **`/atlas:log-issue`** — file fresh issues for any newly-regressed scenarios
- **`/atlas:retest`** — rerun ambiguous scenarios under cleaner conditions
- **`/atlas:report`** — fold the regression delta into the next aggregate report
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
