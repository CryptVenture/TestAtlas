---
command: test-flow
version: 1.0.0
description: Execute scenarios from tests/matrix.json against the running target product, capture per-state evidence, and emit RUN-<timestamp>.{md,json} per PRD §12.15 and §13.
capabilities: [shell, browser, file-write]
produces:
  - test-run
  - evidence
  - command-result
consumes:
  - test-scenario
  - flow
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT run destructive scenarios when allowDestructiveActions=false. Does NOT run against production when allowProductionTesting=false. Does NOT fabricate RUN records — must capture evidence first. Pitfall 15 highest-risk command.
---

# TestAtlas Command: test-flow

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

Execute one or more test scenarios from `_testatlas/tests/matrix.json` against the running target product. Capture evidence (screenshots, logs, network traces, console output, server traces) per PRD §13 and write `RUN-<timestamp>.md` + `RUN-<timestamp>.json` (validates against `test-run.schema.json`) recording per-state coverage (empty / loading / error / success / permission) and per-scenario pass/fail/skipped/blocked status. This command is the highest-risk fabrication surface in the framework — every claim about behaviour MUST be backed by evidence captured first.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §8 (no-evidence-no-finding) and §4 (capability degradation).
- `_testatlas/tests/matrix.json` — the planned scenarios; if missing, halt.
- `_testatlas/flows/<slug>/flow.{md,json}` for each flow under test — preconditions, expected paths, oracle.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. `shell` is required for invoking external test runners and product processes; `browser` is required for UI flows. **If `shell` is unavailable, MUST NOT execute scenarios requiring shell — mark them `skipped: shell unavailable` per `bootstrap.md` §4. If `browser` is unavailable, MUST NOT execute UI scenarios — mark them `skipped: browser unavailable` per `bootstrap.md` §4.** Never simulate browser interactions from training-data priors.
3. Verify safety flags. If `allowDestructiveActions=false`, refuse scenarios marked destructive (data deletion, irreversible mutations, payment captures). If `allowProductionTesting=false`, refuse scenarios whose target environment resolves to production (production hostnames, live API keys); inspect resolved URLs / env names rather than scenario-author claims.
4. For each scenario, execute the steps in order. Capture evidence at every user-visible state required by the scenario plus the canonical PRD §13 set: empty, loading, error, success, permission. Persist evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/` BEFORE making any pass/fail claim. Evidence file names should be stable and self-describing (`step-03-success.png`, `network-har.json`, `console.log.txt`).
   - **Preferred path for evidence sidecars (if `shell` is available):** for each captured evidence file, run `node .testatlas/scripts/create-evidence-record.js --file <path> [--redacted] [--workspace <p>]`. The script content-hashes the file, allocates the next `EVIDENCE-<id>`, AJV-validates against `evidence.schema.json`, and writes `_testatlas/evidence/EVIDENCE-<id>/evidence.{md,json}`. Manual path: hand-author the sidecar pair following `evidence.schema.json`.
5. For each scenario result, record: scenario id, name, type, status (`passed` / `failed` / `skipped` / `blocked`), state-coverage observed (which of the 5 PRD §13 states were exercised), evidence paths (absolute under `_testatlas/evidence/runs/<run-id>/`), observed assertions vs expected, deltas (what differed from the scenario's expected behaviour), and a per-result `confidence` per `bootstrap.md` §8.
6. Write `_testatlas/tests/runs/RUN-<timestamp>.md` (human narrative — one section per scenario) and `_testatlas/tests/runs/RUN-<timestamp>.json` (validates against `test-run.schema.json`). Include a top-level summary: total / passed / failed / skipped / blocked, capabilities used, capabilities unavailable, environment fingerprint.
7. For each failure, do NOT auto-log issues — the operator (or `/atlas:log-issue`) decides which become tracked issues. `test-flow` MAY append an advisory list at `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` of issue candidates with the relevant evidence paths preselected so `log-issue` can adopt them quickly.
8. Update flow confidence per scenario outcomes — flows whose scenarios passed climb in confidence; flows with failures or skips drop and are marked for re-test in the next plan cycle.
9. Validate the produced RUN JSON against `test-run.schema.json` before closing. If validation fails, halt — do not commit a malformed run record.
10. Close the lifecycle (next section).

## Sub-Agent Orchestration

Detect host capability `subagent-spawn` per `bootstrap.md`'s Capability Degradation section (per-host invocation table). Then:

**Independence guard (enforced first):** if any flow in the requested set shares state with another (setup → flow → teardown chain, shared fixture mutation, ordered DB seeding), MUST run sequentially in this thread regardless of capability — parallel execution would corrupt evidence. Only flows with no shared state mutation are eligible for parallel spawn.

**If `subagent-spawn` is available AND flows are independent:**
For each independent flow in the requested flow set:
  Spawn a sub-agent with this brief (markdown convention):
    - **objective:** "Execute `<flow-name>` against the target product and capture per-state evidence."
    - **scope:** "The actions, assertions, and PRD §13 states defined in the flow file."
    - **files-to-read:** "`_testatlas/flows/<flow-name>/flow.{md,json}`; `_testatlas/tests/matrix.json` entries for the flow; any referenced fixtures or seed data; `.testatlas/schemas/test-run.schema.json` and `evidence.schema.json`."
    - **output-format:** "`RUN-<timestamp>.md` + `RUN-<timestamp>.json` per `test-run.schema.json`, with per-state evidence paths under `_testatlas/evidence/runs/<run-id>/<flow-name>/`."
    - **may-write:** sub-agent MAY write evidence files under `_testatlas/evidence/runs/<run-id>/<flow-name>/` and the per-flow run record under `_testatlas/tests/runs/`. Sub-agent MUST NOT write to `_testatlas/to_fix/` directly — the umbrella aggregates issue candidates from the run records into the optional `RUN-<timestamp>.suggestions.md` file.
    - **exit-criteria:** "Run record persisted; pass/fail recorded; evidence redacted per the redaction-pipeline; schema validation passes."
Run all sub-agents in parallel. Wait for all to complete.
Merge structured results into the aggregate run summary.
Mark the run record `executionMode: 'parallel-subagents'`.

**Else (sequential fallback — also taken when flows share state):**
For each flow sequentially in this thread:
  Execute the flow inline following the brief above.
  Capture output.
Synthesize results into the umbrella output.
Mark the run record `executionMode: 'sequential-fallback'`.

**Threshold guard:** if applicable flow count is `< 2` after filtering, run inline regardless of capability (degenerate single-spawn is wasted overhead).

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `_testatlas/tests/runs/RUN-<timestamp>.json` — schema-valid run record with per-scenario results, state coverage, evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/` — captured screenshots, logs, network traces, console output, server traces for every executed scenario.
- Optional `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` — advisory issue candidates for `/atlas:log-issue`.
- Updated flow confidence in `_testatlas/flows/<slug>/flow.json` for every flow touched by this run.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total / passed / failed / skipped / blocked counts, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair and evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by one; recompute `counts.evidence` against the new evidence files.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` executed `<n>` scenarios — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked."

## Stop Conditions

- `_testatlas/tests/matrix.json` missing → halt; "Run /atlas:plan first."
- All scenarios skipped due to missing capabilities → halt; require the operator to enable capabilities or swap adapter. A run with zero exercised scenarios is not a run.
- Production target detected but `allowProductionTesting=false` → halt; refuse to run. Never override a safety flag in-process.
- `safeMode=true` and a step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Evidence file referenced in a result does not exist on disk after capture (write failure, race) → halt; do not record a result citing a non-existent evidence path.
- `test-run.schema.json` validation fails on the produced JSON → halt; do not commit a malformed run.

## Completion Criteria

- At least one `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` pair exists, or there is an unambiguous justification for zero (e.g. all scenarios legitimately skipped) recorded in the run summary.
- Every recorded result cites evidence paths that exist on disk under `_testatlas/evidence/runs/<run-id>/`.
- The RUN JSON validates against `test-run.schema.json`.
- Manifest `counts.runs` and `counts.evidence` are updated to match disk.
- Flow confidence is updated for every flow touched.
- The five lifecycle files listed above are updated.

## What's Next

Now that the flow run is complete:

- **`/atlas:log-issue`** — file individual issues for failing scenarios
- **`/atlas:retest`** — rerun failing scenarios after fixes land
- **`/atlas:report`** — fold the run into the next aggregate report
