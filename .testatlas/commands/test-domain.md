---
command: test-domain
version: 1.0.0
description: Execute domain-scoped test scenarios across PRD §26 modes (negative / state / integration / setup-testability); the scenario's `type` field selects the mode.
capabilities: [shell, file-write]
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
boundary: Does NOT run destructive scenarios when allowDestructiveActions=false. Does NOT run against production when allowProductionTesting=false. Does NOT trigger real charges, real emails, or real SMS in integration mode (sandbox endpoints only). Does NOT fabricate results — must capture evidence first. Pitfall 15 highest-risk command.
---

# TestAtlas Command: test-domain

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

Execute domain-scoped test scenarios from `_testatlas/tests/matrix.json` against the running target product across four PRD §26 test modes: **negative** (PRD §26.5), **state** (PRD §26.6), **integration** (PRD §26.9), and **setup-testability** (PRD §26.10). Scenarios for smoke, user-flow, and exploratory belong to `/atlas:test-flow`; accessibility and performance belong to `/atlas:test-accessibility` and `/atlas:test-performance`. The scenario's `type` field disambiguates the mode at runtime — every scenario carries one of the four enum values above. Output is a `_testatlas/runs/RUN-<timestamp>.{md,json}` pair (the JSON validates against `test-run.schema.json`) plus per-scenario evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/<mode>/`. Like every test command, this is a high fabrication-risk surface — every claim about target behaviour MUST be backed by evidence captured first.

### Mode discoverability

| Mode | PRD §26 ref | Trigger | Evidence bucket |
|------|-------------|---------|-----------------|
| negative | §26.5 | `scenario.type === "negative"` | `evidence/runs/<run-id>/<scenario-id>/negative/` |
| state | §26.6 | `scenario.type === "state"` | `evidence/runs/<run-id>/<scenario-id>/state/` |
| integration | §26.9 | `scenario.type === "integration"` | `evidence/runs/<run-id>/<scenario-id>/integration/` |
| setup-testability | §26.10 | `scenario.type === "setup-testability"` | `evidence/runs/<run-id>/<scenario-id>/setup-testability/` |

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/tests/matrix.json` — the planned scenarios; if missing, halt.
- `_testatlas/flows/<slug>/flow.{md,json}` for any flow referenced by a scenario — preconditions, oracle.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the RUN sidecar (`type` enum includes all PRD §26 values).
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars (TEST-03 redaction discipline).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/runs/<run-id>/<scenario-id>/<mode>/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. **If `shell` is unavailable, MUST NOT execute scenarios that require running test runners, dev servers, fixtures, migrations, or seed scripts — mark them `skipped: shell unavailable` per `bootstrap.md` §4 and emit a partial RUN containing only the skipped entries. Add `tool_unavailable: shell` to each affected result. Never simulate command output, exit codes, or side-effects from training-data priors.**
3. Verify safety flags. If `allowDestructiveActions=false`, refuse scenarios whose steps mutate, delete, or otherwise irreversibly affect data — including any setup-testability scenario that calls `db:reset`, `migrate down`, fixture wipes, or destructive seed operations. If `allowProductionTesting=false`, inspect the resolved target URL/env name (do not trust scenario-author claims) and refuse production targets. Halt the run rather than degrade silently.
4. **Mode disambiguation.** For each scenario in scope (filter `tests/matrix.json` by the four supported `type` values; ignore others — they belong to other test commands), branch on `scenario.type`:
   - **`negative`** — exercise invalid input, permission denial, missing-resource access, malformed payloads, expired sessions, rate-limit triggers. Assert that the target returns the expected error response (status code, error code, message shape) without leaking secrets, stack traces, or internal IDs. Capture request, response, and any rendered error UI as evidence.
   - **`state`** — exercise the canonical lifecycle states from PRD §13: empty, loading, error, success, permission-denied, long-list, partial-data, stale-cache. Capture per-state evidence (one screenshot or DOM snapshot or log file per state observed). A scenario need not exercise every state, but every state it claims to cover MUST have its own evidence file.
   - **`integration`** — exercise external-service contracts (auth providers, payment processors, email, SMS, webhook receivers). **Sandbox endpoints only** — refuse if the resolved endpoint is a production URL or uses live API keys. Capture the outbound request, the recorded response, and the target-side acknowledgement as evidence. Never trigger real charges, real emails, or real SMS deliveries.
   - **`setup-testability`** — exercise the install / seed / migrate / configure paths the next agent needs to reproduce results. Capture the before-state, the command run, the after-state, and any side-effect inventory. The scenario passes when the recorded after-state matches the scenario's expected post-condition.
5. For each scenario, capture evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/<mode>/` BEFORE making any pass / fail / skipped / blocked claim. Evidence file names should be stable and self-describing (`request.json`, `response.json`, `state-empty.png`, `before.json`, `after.json`, `console.log.txt`). Apply TEST-03 redaction discipline per `evidence.schema.json` — strip secrets, tokens, PII before persisting.
6. Record per-scenario results: scenario id, name, `type` (one of `negative` | `state` | `integration` | `setup-testability` per `test-run.schema.json` enum), status (`passed` | `failed` | `skipped` | `blocked`), evidence paths (under `_testatlas/evidence/runs/<run-id>/`), observed vs expected assertions, deltas, and a per-result `confidence` per `bootstrap.md` §8.
7. Write `_testatlas/runs/RUN-<timestamp>.md` (human narrative — one section per scenario, grouped by mode) and `_testatlas/runs/RUN-<timestamp>.json` (the schema-valid sidecar). Include a top-level summary: total / passed / failed / skipped / blocked, per-mode counts, capabilities used, capabilities unavailable, environment fingerprint.
8. Validate the produced RUN JSON against `test-run.schema.json` before commit. Halt if validation fails — do not commit a malformed run record.
9. Update flow confidence per scenario outcome — flows whose scenarios passed climb in confidence; flows with failures or skips drop and are flagged for the next plan cycle.
10. Close the lifecycle (next section).

### `--all` mode

When invoked as `/atlas:test-domain --all`:

1. Enumerate domains referenced by ≥1 scenario in the test-scenario matrix (read each per-scenario sidecar `_testatlas/tests/scenarios/TEST-*.json`'s `domain` field — or, equivalently, the bundled `_testatlas/tests/matrix.json` if present — and dedupe). Filter further to scenarios whose `type` is one of the four PRD §26 modes (`negative`, `state`, `integration`, `setup-testability`); other types belong to sister test commands. Domains in `_testatlas/domains/` with zero in-scope scenarios MUST be skipped silently — they have no oracle.
2. For each in-scope domain, execute the per-domain Required Actions block above (mode disambiguation included) and accumulate per-domain results into a SINGLE merged `_testatlas/runs/RUN-<timestamp>.{md,json}` with `executionMode: 'all-domains'` recorded inside the run-record metadata (run-record metadata only — the `test-run.schema.json` `type` enum is unchanged).
3. **Capability-blocked scenarios** — `shell` unavailable for the scenario's runner; OR scenario carries `pending: capability-required` per `test-scenario.schema.json`; OR an `integration` scenario whose resolved endpoint is production / live-key (refusal is a skip-with-justification, not a halt) — are recorded as `status: 'skipped'` with `skipReason` populated. `--all` MUST NOT halt on the first capability-required skip; it accumulates skip records and continues through the remaining domains.
4. Halt only when every in-scope scenario was skipped AND the skip reasons are all non-user-recoverable (e.g., `shell` missing in the adapter + safety flag refusal — the operator cannot proceed in this thread).

## Outputs

- `_testatlas/runs/RUN-<timestamp>.md` and `_testatlas/runs/RUN-<timestamp>.json` — schema-valid run record with per-scenario results, mode tags, and evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/<mode>/` — captured request / response / state / before-after evidence per scenario.
- Updated flow confidence in `_testatlas/flows/<slug>/flow.json` for every flow touched by this run.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total / passed / failed / skipped / blocked counts, per-mode counts, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair and evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by one; recompute `counts.evidence` against the new evidence files.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (test-domain) executed `<n>` scenarios across `<m>` modes — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked."

## Stop Conditions

- `_testatlas/tests/matrix.json` missing → halt; "Run /atlas:plan first."
- No scenarios match the four supported types → halt; "test-domain has no scenarios in scope. Use /atlas:test-flow, /atlas:test-accessibility, or /atlas:test-performance."
- All in-scope scenarios skipped due to missing `shell` capability → halt; require the operator to enable shell or swap adapter.
- Resolved target is a production host but `allowProductionTesting=false` → halt; refuse to run.
- An integration-mode scenario would trigger a real charge, real email, or real SMS (resolved endpoint is production or live key detected) → refuse and halt that scenario; continue with the rest.
- `safeMode=true` and a step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Evidence file referenced in a result does not exist on disk after capture → halt; do not record a result citing a non-existent path.
- `test-run.schema.json` validation fails on the produced JSON → halt; do not commit a malformed run.
- `--all` mode does NOT halt on a single capability-blocked or `pending: capability-required` scenario — it accumulates skip records and continues; halts only when every in-scope scenario is skipped AND all skip reasons are non-user-recoverable.

## Completion Criteria

- At least one `_testatlas/runs/RUN-<timestamp>.{md,json}` pair exists, or there is an unambiguous justification for zero (e.g. all in-scope scenarios legitimately skipped) recorded in the run summary.
- Every recorded result cites evidence paths that exist on disk under `_testatlas/evidence/runs/<run-id>/`.
- Every scenario result's `type` is one of the four supported enum values: `negative`, `state`, `integration`, `setup-testability`.
- The RUN JSON validates against `test-run.schema.json`.
- Manifest `counts.runs` and `counts.evidence` are updated to match disk.
- Flow confidence is updated for every flow touched.
- The five lifecycle files listed above are updated.

## What's Next

Now that the domain run is complete:

- **`/atlas:log-issue`** — file individual issues for failing scenarios
- **`/atlas:retest`** — rerun failing scenarios after fixes land
- **`/atlas:report`** — fold the run into the next aggregate report
