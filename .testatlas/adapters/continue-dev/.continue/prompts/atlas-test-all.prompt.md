---
name: atlas-test-all
description: Umbrella test orchestrator — runs `/atlas:test-flow --all` AND `/atlas:test-domain --all` and aggregates per-child run records into a single merged RUN-<timestamp>.{md,json}.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test-all.md" hash="94a13ff656c443144149dca6f4ecae9b06daec88863fb2a9b44228488f53da43" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-test-all.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Full-coverage test replay across the entire test surface in one command. `/atlas:test-all` invokes `/atlas:test-flow --all` AND `/atlas:test-domain --all`, then merges the two child run records into a single `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` (validating against `test-run.schema.json`). Mirrors the `/atlas:explore` umbrella shape: the umbrella owns scenario partitioning + aggregation; children own per-scenario execution + evidence. Scenarios marked `pending: capability-required` or capability-blocked are recorded as skipped-with-justification — `--all` MUST NOT halt on the first capability skip.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §3 (precedence), §4 (capability degradation), §8 (no-evidence-no-finding).
- `_testatlas/tests/matrix.json` and `_testatlas/tests/scenarios/TEST-*.{md,json}` — the planned scenarios; if `matrix.json` is missing AND every per-scenario sidecar is also missing, halt with `Run /atlas:plan first.`
- `_testatlas/11_workspace_manifest.json` — initialization status, existing run counts.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` and `.testatlas/schemas/evidence.schema.json` — schemas for the merged sidecar and child evidence.
- `.testatlas/commands/test-flow.md` and `.testatlas/commands/test-domain.md` — per-child contracts (especially each file's `### --all mode` section).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every per-scenario claim in the merged run record MUST cite an evidence file path under `_testatlas/evidence/runs/<run-id>/` produced by the executing child. The umbrella never fabricates.
2. **Verify capabilities.** Detect `shell`, `browser`, `file-write`, `subagent-spawn` per `bootstrap.md` Capability Degradation. **If `shell` is unavailable**, scenarios needing runners/dev-servers are recorded as `skipped: shell unavailable`. **If `browser` is unavailable**, UI scenarios are `skipped: browser unavailable`. The skip-not-halt rule is the umbrella's primary degradation contract — never simulate runner output, browser interactions, or oracle results from training-data priors.
3. **Verify safety flags.** If `allowDestructiveActions=false`, no destructive scenario runs; if `allowProductionTesting=false`, refuse production targets (inspect resolved URL/env, do not trust scenario-author claims). Halt rather than degrade silently.
4. **Partition scenarios** by `type`:
   - `smoke` | `user-flow` | `exploratory` → `/atlas:test-flow --all`
   - `negative` | `state` | `integration` | `setup-testability` → `/atlas:test-domain --all`
   - `accessibility` | `performance` | `regression` are out of scope for `test-all` — silently skip; they have their own commands.
5. **Invoke the children** per the executionMode selected below: spawn both in parallel via `subagent-spawn` when available; otherwise sequentially in this thread. Each child writes its own RUN sidecar pair and evidence dirs. Capability-blocked or `pending: capability-required` scenarios are recorded as `status: 'skipped'` with `skipReason`; the umbrella does NOT halt on such skips.
6. **Merge** the two child RUN sidecars into ONE `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` validated against `test-run.schema.json`. Each merged result preserves its original `type`. Top-level summary aggregates total/passed/failed/skipped/blocked, plus `executionMode: 'all'` in run-record metadata (NOT a schema-enum). A `children:` sub-object links per-child contributing run ids.
7. **Validate** the merged JSON against `test-run.schema.json`. Halt on failure — do not commit a malformed run.
8. **Update flow + domain confidence** per outcomes; pass climbs, fail/unrecoverable-skip drops and flags for the next plan cycle.
9. **Failure aggregation.** If a child halts on its own stop condition, record `childStatus: 'halted'`; surface its coverage as a gap. The umbrella halts ONLY when both children halt OR every in-scope scenario was skipped with non-user-recoverable reasons.
10. **Close the lifecycle** (next section).

## Sub-Agent Orchestration

Spawn-and-aggregate orchestrator. When the host declares `subagent-spawn`, the umbrella spawns each child in parallel via the Agent tool. Child task pool: `{test-flow, test-domain}`, filtered by step 4.

**executionMode selection** (5 enum values match `/atlas:explore`):

- `subagent-spawn` available + 2 children with in-scope scenarios → **`parallel-subagents`** (default).
- `subagent-spawn` available + exactly 1 child → **`single-spawn-inline`** (degenerate spawn = inline).
- `subagent-spawn` unavailable + sequential mode + ≥1 child → **`sequential-fallback`** (test-flow first, then test-domain).
- `subagent-spawn` unavailable + classify-only env → **`classify-only`** (record partition + briefs; surface as coverage-gap).
- 0 in-scope children → **`no-op`** (`Nothing to test.`).

**Independence guard.** The type-enum partition has no overlap by construction — children ARE independent and safe to run in parallel.

**Per-child brief contract** (6 slots):

- **objective:** "Execute every in-scope scenario for `<child>` against the target product per the `--all` mode contract."
- **scope:** "Scenarios partitioned to `<child>` by the umbrella, plus the PRD §13/§26 procedure the child documents."
- **files-to-read:** "`.testatlas/commands/<child>.md`; the per-scenario sidecars partitioned to this child; relevant `_testatlas/flows/<slug>/flow.{md,json}`; `test-run.schema.json` and `evidence.schema.json`."
- **output-format:** "RUN sidecar pair per `test-run.schema.json` with per-state evidence under `_testatlas/evidence/runs/<run-id>/`. Capability-blocked scenarios appear as `status: 'skipped'` with `skipReason`."
- **may-write:** "child writes only to `_testatlas/evidence/runs/<run-id>/` and per-child run record. Child MUST NOT write `_testatlas/to_fix/` — umbrella aggregates suggestions."
- **exit-criteria:** "Run record persisted; status recorded; evidence redacted; RUN JSON validates. Capability-blocked skips do NOT count as halts."

**Aggregation clause.** After children return (parallel) or complete (sequential), the umbrella reads each child's RUN sidecar pair, merges `results[]` preserving each result's `type`, recomputes the top-level summary, and writes the merged sidecar per Action 6.

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `_testatlas/tests/runs/RUN-<timestamp>.json` — merged run record with per-scenario results from BOTH children, executionMode metadata, and a `children:` sub-object.
- Per-child RUN pairs survive at their authored locations under `_testatlas/tests/runs/`. All test-* runners write to `_testatlas/tests/runs/RUN-<ts>` — there is no per-runner output-path split.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/` — owned by the executing child.
- Optional `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` — aggregate issue candidates, deduped.
- Updated flow + domain confidence for every flow/domain touched.

## Lifecycle

Update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — merged run id, executionMode, aggregated counts, capabilities used + unavailable, references to per-child run ids.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`; record `executionMode`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by ONE (per-child runs accounted for via `children:`); recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (test-all, executionMode `<mode>`) executed `<n>` scenarios — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked."

## Stop Conditions

- No per-scenario sidecars AND no `_testatlas/tests/matrix.json` → halt; "Run /atlas:plan first."
- BOTH children halt on their own stop conditions → halt with both error codes surfaced. (Single child halt is a coverage-gap, not a stop condition.)
- Every in-scope scenario was skipped AND skip reasons are all non-user-recoverable → halt; require the operator to enable capabilities or swap adapter.
- Resolved target is production but `allowProductionTesting=false` → halt.
- `safeMode=true` and a step would mutate target-repo source files → halt.
- `test-run.schema.json` validation fails on the merged JSON → halt.

## Completion Criteria

- One merged RUN pair exists; the JSON validates.
- The merged record's `children:` sub-object lists both per-child run ids (when both ran); a no-op child appears as `status: 'no-op'` with rationale.
- Every recorded result cites evidence paths that exist on disk.
- `10_command_log.md` row records `executionMode` matching the selected mode.
- Manifest `counts.runs` is incremented by exactly 1; `counts.evidence` matches disk.
- Flow + domain confidence updated for every flow/domain touched.
- The five lifecycle files updated.
- Zero stop conditions triggered.

## What's Next

Now that the full-coverage test run is complete:

- **`/atlas:log-issue`** — file individual issues for failing scenarios across both children
- **`/atlas:retest`** — rerun failing or unverified scenarios under cleaner conditions
- **`/atlas:report`** — fold the merged run into the next aggregate report
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
