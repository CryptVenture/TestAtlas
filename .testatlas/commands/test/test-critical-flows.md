---
command: test-critical-flows
version: 2.0.0
description: Identify and execute the highest-value flows based on documented product risk (test strategy priority, scenario coverage, domain priority, issue severity), capturing per-state evidence and producing a RUN-<timestamp> report.
capabilities: [shell, browser, MCP, file-write]
produces:
  - command-result
  - test-run
  - evidence
consumes:
  - command-instruction
  - flow
  - test-scenario
  - issue
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT execute destructive scenarios when `allowDestructiveActions=false`. Does NOT run against production when `allowProductionTesting=false`. Does NOT fabricate run records — every claim cites evidence captured first.
---

# TestAtlas Command (V2 test): test-critical-flows

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/manifest.json`, `_testatlas/brain/state.json`, `_testatlas/02_test_strategy.md`, `_testatlas/tests/matrix.json`.
4. Inspect `_testatlas/brain/domains.json`, `_testatlas/brain/flows.json`, and `_testatlas/to_fix/` for the prioritisation inputs.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

`test-critical-flows` is the risk-focused counterpart to `test-flow --all`.
It does NOT walk every scenario — it executes the flows that matter most to
the product right now, then captures evidence and reports outcomes. It is
the command an operator runs when time is bounded (release gate, on-call
spot-check, post-incident regression) and skipping low-risk paths is the
correct choice.

## Risk-based prioritisation inputs

The four inputs MUST all be considered. A flow earns "critical" only if it
ranks high under at least two of them.

1. **`_testatlas/02_test_strategy.md` priority** — explicitly documented
   priority statements (e.g., "checkout, signup, password-reset are P0
   release-blocking flows").
2. **`_testatlas/tests/matrix.json` scenario coverage** — flows with the
   highest count of high/critical-priority scenarios. Flows with zero
   scenarios are NOT executed by this command (they have no oracle); they
   are silently skipped with a recommendation to run `/atlas:test-generate-scenarios` first.
3. **Domain priority** — `_testatlas/brain/domains.json` `priority`
   ordering. Business-critical domains first (auth, payments, identity,
   data-write paths) ahead of nice-to-have domains.
4. **Issue severity** — flows referenced by open `high` or `critical`
   issues in `_testatlas/to_fix/`. Open severity surfaces previously-broken
   areas that need the most assurance.

A flow is "critical" iff it scores high on `02_test_strategy.md` priority
PLUS at least one of (matrix coverage ≥ 2 high-priority scenarios) OR
(domain priority `high`/`critical`) OR (referenced by an open
`high`/`critical` issue).

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/02_test_strategy.md`
- `_testatlas/tests/matrix.json`
- `_testatlas/brain/domains.json`, `_testatlas/brain/flows.json`
- `_testatlas/to_fix/by_severity/` indexes
- `.testatlas/schemas/test-run.schema.json`

## Required Actions

1. Build the critical-flow set by intersecting the four inputs above. Record
   the rationale per flow (which inputs flagged it). Empty result → halt
   with `NO_CRITICAL_FLOWS` and recommend a strategy review.
2. For each critical flow, follow the same execution contract as
   `/atlas:test-flow`:
   - Verify capabilities. `shell` is required to drive runners; `browser` +
     `MCP` are required for UI walkthroughs (see
     `.testatlas/reference/chrome-devtools-mcp.md` § *Interactive-surface
     walkthrough* — mandatory when both capabilities are available).
   - Verify safety flags. Refuse destructive scenarios when
     `allowDestructiveActions=false`; refuse production when
     `allowProductionTesting=false`.
   - Execute steps; capture evidence at every PRD §13 state observed (empty,
     loading, error, success, permission). Persist evidence under
     `_testatlas/evidence/runs/<run-id>/<flow-id>/` BEFORE any pass/fail
     claim.
3. Update **flow docs** (`_testatlas/flows/<slug>/flow.json` confidence,
   `last_updated`), the **evidence index**
   (`_testatlas/09_artifact_index.md`), **issues**
   (`_testatlas/to_fix/<ISSUE-id>.json` `retestNotes`/`history`), and
   **brain events** (append via `node .testatlas/scripts/append-event.js`).
4. Write `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` with summary
   counts (total / passed / failed / skipped / blocked) and a
   `prioritisation` field listing why each flow was in scope. Validates
   against `test-run.schema.json`.
5. Optionally append a `RUN-<timestamp>.suggestions.md` listing candidate
   issues for `/atlas:log-issue`.
6. Close the lifecycle.

## Allowed Tools

- filesystem (read on the four prioritisation inputs; write on `_testatlas/tests/runs/`, `_testatlas/evidence/runs/`, `_testatlas/flows/`)
- shell (preferred path; `node` for runners)
- browser + MCP (UI walkthroughs)
- file-write (atomic write of run + evidence sidecars)

## Capability Degradation

- `shell` unavailable → MUST NOT execute scenarios requiring shell. Mark them `skipped: shell unavailable` per `bootstrap.md` §4.
- `browser` or `MCP` unavailable → MUST NOT simulate UI flows. Mark them `skipped: browser/MCP unavailable`.
- Never simulate browser interactions from priors. Never fabricate evidence.

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `.json` (schema-valid; carries `prioritisation` rationale)
- `_testatlas/evidence/runs/<run-id>/<flow-id>/` directory of captured evidence
- Updated `_testatlas/flows/<slug>/flow.json` confidence values
- Brain event + lifecycle close

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total / passed / failed / skipped / blocked counts, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair and evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.testRuns` by one; recompute `counts.evidenceRecords`.
- `_testatlas/history/run_log.md` — narrative entry: "Critical-flow run RUN-`<ts>` — `<n>` flows, `<n>` passed, `<n>` failed, prioritisation `<rationale>`."

## Stop Conditions

- `_testatlas/02_test_strategy.md` missing → halt with `TEST_STRATEGY_MISSING`.
- `_testatlas/tests/matrix.json` missing → halt with `MATRIX_MISSING`.
- Critical flow set empty → halt with `NO_CRITICAL_FLOWS` and recommend a strategy review.
- Evidence directory cannot be written → halt with `EVIDENCE_DIR_UNWRITABLE`.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command test-critical-flows --status success` (or `--status failure` with the error code).

## Completion Criteria

- All `RUN-<timestamp>.md` and matching `RUN-<timestamp>.json` files for every critical flow exercised exist under `_testatlas/tests/runs/` (per Required Actions step 4).
- Every produced `RUN-*.json` validates against `test-run.schema.json` (run `node .testatlas/scripts/validate-workspace.js` and confirm zero schema-validation findings under `tests/runs/`).
- `_testatlas/11_workspace_manifest.json` reflects updated `counts.testRuns` and `counts.evidenceRecords` (these ARE the schema's canonical keys per `workspace-manifest.schema.json` — do not rename).
- The five lifecycle files (`03_execution_status.md`, `09_artifact_index.md`, `10_command_log.md`, `11_workspace_manifest.json`, `history/run_log.md`) are updated.
- Zero stop conditions triggered (`TEST_STRATEGY_MISSING`, `MATRIX_MISSING`, `NO_CRITICAL_FLOWS`, `EVIDENCE_DIR_UNWRITABLE` all clear; capability gaps logged with `confidence: needs-validation`, no fabrication).

## What's Next

Now that critical flows have run:

- **`/atlas:report`** — produce a readiness report on the critical-flow run.
- **`/atlas:retest`** — schedule retests for any failing critical flows.
- **`/atlas:log-issue`** — file issues for newly surfaced critical-flow failures.
