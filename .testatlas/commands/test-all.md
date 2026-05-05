---
command: test-all
version: 1.0.0
description: Umbrella test orchestrator — runs `/atlas:test-flow --all` AND `/atlas:test-domain --all` and aggregates per-child run records into a single merged RUN-<timestamp>.{md,json}.
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
boundary: Does NOT run destructive scenarios when allowDestructiveActions=false. Does NOT run against production when allowProductionTesting=false. Does NOT fabricate results — every per-scenario claim cites evidence captured by the underlying child command. Does NOT halt on a single capability-blocked scenario; aggregates skip records and continues. Pitfall 15 highest-risk command surface (delegates to the two highest-risk children).
---

# TestAtlas Command: test-all

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

Full-coverage test replay across the entire test surface in one command. `/atlas:test-all` invokes `/atlas:test-flow --all` AND `/atlas:test-domain --all`, then merges the two child run records into a single `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` (validating against `test-run.schema.json`). It mirrors the umbrella shape `/atlas:explore` already establishes for the explore family — the umbrella owns scenario partitioning + aggregation, the children own per-scenario execution + evidence. Children execute scenarios referenced by ≥1 entry in the test-scenario matrix (per-scenario sidecars under `_testatlas/tests/scenarios/`); scenarios marked `pending: capability-required` or capability-blocked are recorded as skipped-with-justification — `--all` (and therefore `test-all`) MUST NOT halt on the first capability skip.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §3 (precedence), §4 (capability degradation), and §8 (no-evidence-no-finding).
- `_testatlas/tests/matrix.md` and the per-scenario sidecars `_testatlas/tests/scenarios/TEST-*.{md,json}` — the planned scenarios; if every scenario sidecar is missing, halt with `Run /atlas:plan first.`
- `_testatlas/11_workspace_manifest.json` — to confirm initialization status and read existing run counts.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the merged RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars (children own evidence; the umbrella links to it).
- `.testatlas/commands/test-flow.md` and `.testatlas/commands/test-domain.md` — the per-child contracts (especially each file's `### --all mode` section).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every per-scenario claim in the merged run record MUST cite an evidence file path under `_testatlas/evidence/runs/<run-id>/` produced by the executing child. The umbrella never fabricates results from training-data priors and never re-asserts a child's claim without a path that resolves on disk.
2. **Verify capabilities.** Detect host capabilities (`shell`, `browser`, `file-write`, `subagent-spawn`) per `bootstrap.md` Capability Degradation. Record the available + degraded set in the merged run-record metadata. The skip-not-halt rule in step 5 is the umbrella's primary degradation contract.
3. **Verify safety flags.** If `allowDestructiveActions=false`, no destructive scenario will run; if `allowProductionTesting=false`, refuse production targets — inspect resolved URL/env (do not trust scenario-author claims). Halt the command rather than degrade silently when a safety flag is violated.
4. **Partition scenarios.** Read every per-scenario sidecar `_testatlas/tests/scenarios/TEST-*.json` (and the bundled `_testatlas/tests/matrix.json` if present). Partition scenarios by which child handles them:
   - `smoke` | `user-flow` | `exploratory` → `/atlas:test-flow --all`
   - `negative` | `state` | `integration` | `setup-testability` → `/atlas:test-domain --all`
   - `accessibility` | `performance` | `regression` are out of scope for `test-all` — silently skip; they have their own commands (`/atlas:test-accessibility`, `/atlas:test-performance`, `/atlas:test-regression`).
5. **Invoke the children** per the executionMode selected in Sub-Agent Orchestration below: spawn both children in parallel via `subagent-spawn` when available; otherwise run them sequentially in this thread. Each child writes its own per-child RUN sidecar pair into `_testatlas/tests/runs/` (test-flow) or `_testatlas/runs/` (test-domain) and its own evidence dirs under `_testatlas/evidence/runs/<run-id>/<scenario-id>/`. Capability-blocked or `pending: capability-required` scenarios are recorded as `status: 'skipped'` with `skipReason` populated; the umbrella does NOT halt on such skips, it accumulates them.
6. **Merge** the two child RUN sidecars into ONE `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` validated against `test-run.schema.json`. Each merged result preserves its original `type` field (so the schema enum is unchanged). Top-level summary aggregates total / passed / failed / skipped / blocked counts across both children, plus `executionMode: 'all'` in run-record metadata (run-record metadata only — NOT a schema-enum value). Per-child contributions are linked from a `children:` sub-object so the lineage is auditable.
7. **Validate** the produced merged JSON against `test-run.schema.json`. Halt on validation failure — do not commit a malformed run.
8. **Update flow + domain confidence** per the per-scenario outcomes from each child. Flows whose scenarios all passed climb in confidence; flows with failures or unrecoverable skips drop and are flagged for the next plan cycle. Same rule applies to domains via `_testatlas/domains/<slug>/domain.json`.
9. **Failure aggregation.** If a child halts on its own stop condition (e.g., matrix missing for that child's scope), record the halt in the merged run with `childStatus: 'halted'` and surface the child's coverage as a gap. The umbrella halts ONLY when both children halt OR every in-scope scenario was skipped AND skip reasons are non-user-recoverable.
10. **Close the lifecycle** (next section).

## Sub-Agent Orchestration

This umbrella is a spawn-and-aggregate orchestrator. When the host declares the `subagent-spawn` capability (per `bootstrap.md` Capability Degradation), the umbrella spawns each child in parallel via the Agent tool. The child task pool is `{test-flow, test-domain}`, filtered by Required Actions step 4 — children with zero in-scope scenarios are not invoked.

**executionMode selection matrix** (the 5 enum values match the canonical vocabulary established by `/atlas:explore`):

- `subagent-spawn` available + 2 children with in-scope scenarios → **`parallel-subagents`** (default).
- `subagent-spawn` available + exactly 1 child with in-scope scenarios → **`single-spawn-inline`** (degenerate spawn = inline execution; spare overhead).
- `subagent-spawn` unavailable + sequential capability available + ≥1 child → **`sequential-fallback`** (run children in this thread, in order: test-flow first, then test-domain).
- `subagent-spawn` unavailable + classify-only environment → **`classify-only`** (record the partition and the child briefs, but do NOT execute; surface as a coverage-gap).
- 0 children with in-scope scenarios → **`no-op`** (record the empty merged run; `Nothing to test.`).

**Independence guard.** Children operate on disjoint scenario subsets (the partition in Required Actions step 4 has no overlap by construction — the type-enum domains are mutually exclusive). They ARE independent and safe to run in parallel; the umbrella does not need to serialize them when `parallel-subagents` is selected.

**Per-child brief contract** (6 slots, mirrors the explore.md and test-flow.md sub-agent briefs):

- **objective:** "Execute every in-scope scenario for `<child-name>` against the target product following the `--all` mode contract."
- **scope:** "The scenarios partitioned to `<child-name>` by the umbrella, plus the PRD §13 / §26 procedure the child already documents."
- **files-to-read:** "`.testatlas/commands/<child-name>.md`; the per-scenario sidecars partitioned to this child; `_testatlas/flows/<slug>/flow.{md,json}` for any referenced flow; `.testatlas/schemas/test-run.schema.json` and `evidence.schema.json`."
- **output-format:** "`RUN-<timestamp>.md` + `RUN-<timestamp>.json` per `test-run.schema.json`, with per-state evidence paths under `_testatlas/evidence/runs/<run-id>/`. Capability-blocked scenarios appear as `status: 'skipped'` with `skipReason`."
- **may-write:** child MAY write evidence under `_testatlas/evidence/runs/<run-id>/` and the per-child run record. Child MUST NOT write to `_testatlas/to_fix/` directly — the umbrella aggregates issue candidates into the optional merged `RUN-<timestamp>.suggestions.md` file.
- **exit-criteria:** "Per-child run record persisted; pass/fail/skipped/blocked recorded; evidence redacted per the redaction-pipeline; child's RUN JSON validates against `test-run.schema.json`. Capability-blocked skips do NOT count as halts — child returns normally with the skip records."

**Aggregation clause.** After children return (parallel) or complete (sequential), the umbrella reads each child's RUN sidecar pair, merges the `results[]` arrays preserving each result's original `type`, recomputes the top-level summary, and writes the merged `RUN-<timestamp>.{md,json}` per Required Actions step 6.

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `_testatlas/tests/runs/RUN-<timestamp>.json` — schema-valid merged run record with per-scenario results from BOTH children, executionMode metadata, and a `children:` sub-object linking the per-child contributing run ids.
- The two per-child RUN pairs survive at their authored locations (`_testatlas/tests/runs/RUN-...` from test-flow; `_testatlas/runs/RUN-...` from test-domain) — the umbrella links to them, never overwrites.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/` — captured evidence per executed scenario, owned by the executing child.
- Optional `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` — aggregate advisory issue candidates for `/atlas:log-issue`, deduped across both children.
- Updated flow confidence + domain confidence for every flow / domain touched by either child.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record merged run id, executionMode, total / passed / failed / skipped / blocked counts (aggregated), capabilities used + unavailable, references to both per-child run ids.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the merged RUN pair, both per-child RUN pairs, and the evidence directories must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing the merged run id; record `executionMode` matching the selected mode.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by ONE (the merged run is one logical run, not two — the per-child runs are accounted for via the merged record's `children:` sub-object); recompute `counts.evidence` against the new evidence files.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (test-all, executionMode `<mode>`) executed `<n>` scenarios across both children — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked."

## Stop Conditions

- No per-scenario sidecars on disk under `_testatlas/tests/scenarios/` AND no bundled `_testatlas/tests/matrix.json` → halt; "Run /atlas:plan first."
- BOTH children halt on their own stop conditions → halt with both child error codes surfaced. (A single child halt is NOT a stop condition — it surfaces as a coverage-gap and the merged run records `status: 'partial'`.)
- Every in-scope scenario was skipped AND every skip reason is non-user-recoverable → halt; require the operator to enable capabilities or swap adapter. A run with zero exercised scenarios and no recoverable path forward is not a run.
- Resolved target is a production host but `allowProductionTesting=false` → halt; refuse to run.
- `safeMode=true` and a step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- `test-run.schema.json` validation fails on the merged JSON → halt; do not commit a malformed merged run.

## Completion Criteria

- One merged `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` pair exists; the JSON validates against `test-run.schema.json`.
- The merged record's `children:` sub-object lists both per-child run ids (when both children executed); when only one child had in-scope scenarios, the missing child appears in the `children:` sub-object as `status: 'no-op'` with the partition rationale.
- Every recorded result cites evidence paths that exist on disk under `_testatlas/evidence/runs/<run-id>/`.
- `10_command_log.md` row records `executionMode` matching the selected mode.
- Manifest `counts.runs` is incremented by exactly 1 (the merged run); `counts.evidence` matches disk.
- Flow confidence + domain confidence are updated for every flow / domain touched.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the full-coverage test run is complete:

- **`/atlas:log-issue`** — file individual issues for failing scenarios across both children
- **`/atlas:retest`** — rerun failing or unverified scenarios under cleaner conditions
- **`/atlas:report`** — fold the merged run into the next aggregate report
