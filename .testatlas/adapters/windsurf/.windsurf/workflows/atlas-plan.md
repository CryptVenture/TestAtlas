---
description: Produce a risk-based, domain-based, flow-based, state-aware test strategy and master plan covering 02_test_strategy.md, plans/PLAN-master.md, the test matrix, and exploratory charters per PRD §12.14.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/plan.md" hash="67d4e0d02dec3e1786cc7b520544c2fa3ebbfea3e10489019378e6ef9955dc38" -->
First read `.testatlas/bootstrap.md`. Then read `.windsurf/workflows/atlas-plan.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Produce a test strategy and master plan: `_testatlas/02_test_strategy.md`, `_testatlas/plans/PLAN-master.md`, `_testatlas/tests/matrix.md` + `matrix.json`, and `_testatlas/tests/exploratory_charters.md` per PRD §12.14. Strategy is risk-based, domain-based, flow-based, and state-aware. Output is reasoning-derived (a plan, not a finding); per-scenario confidence is governed by `bootstrap.md` §11 (claim-confidence rule), not §8 (evidence rule).

## Required First Reads

- `.testatlas/bootstrap.md` — especially §11 (claim-confidence) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — what surfaces exist to test.
- `_testatlas/domains/*/domain.json` — every domain `map-domains` produced; the unit of test planning.
- `_testatlas/flows/` — any flows recorded by prior runs (used to derive flow-targeted scenarios).
- `_testatlas/to_fix/` — any prior issues; closed/active issues feed regression scenarios.
- `.testatlas/schemas/matrix.schema.json` — required JSON shape for the bundled `matrix.json` index.
- `.testatlas/schemas/test-scenario.schema.json` — required JSON shape per scenario sidecar in `tests/scenarios/`.
- `.testatlas/default.config.json` — currently declared adapter capabilities (used to gate scenarios per step 8).
- `_testatlas/agents/councils/sessions/*/consolidation.json` — most recent council session consolidations (filter to test-plan mode); read to honor matrix decisions ratified by council.

## Required Actions

1. Identify high-risk surfaces. Cross-reference signals: domains with the most routes/APIs (blast radius), integrations marked sandbox vs production (regression risk), flows with state-coverage gaps (PRD §13 — empty/loading/error/success/permission), and surfaces that have produced prior issues. Rank surfaces by an explicit risk score; record the scoring rationale in `02_test_strategy.md`.
2. For each domain, generate test scenarios per PRD §26 test types. The dogfood loop targets `smoke` first; mark scenarios for `regression`, `exploratory`, `negative`, `state`, `accessibility`, `performance`, `security`, `data-integrity`, and `user-flow` as deferred to Phase-4 commands and assign them to subsequent runs rather than the immediate matrix.
3. Each scenario MUST include: a stable scenario id, name, type, target flow and/or domain, preconditions (workspace + product state), steps (numbered, evidence-attaching), expected behaviour, evidence-to-capture (which states, what artifacts), capability requirements (`shell`, `browser`, `web-fetch`, `MCP`), priority (P0/P1/P2), and a per-scenario `confidence` per `bootstrap.md` §11 reflecting how well the underlying domain evidence supports the scenario's premise.
4. Write `_testatlas/02_test_strategy.md` — a one-page strategy framing: scope, risk model, test-type mix, capability-availability assumptions, success thresholds, and explicit out-of-scope items.
5. Write `_testatlas/plans/PLAN-master.md` — the prioritized master scenario list (P0 → P1 → P2). Each row links to its `matrix.json` entry by id and notes the next command (`/atlas:test-flow`, etc.) that will execute it.
   - **Preferred path for flow emission (if `shell` is available):** for each net-new flow surfaced by the strategy, run `node .testatlas/scripts/create-flow.js --name "<name>" --domain domain-<slug> --persona "<persona>" --goal "<goal>" [--priority <priority>] [--status draft] [--confidence <c>] [--workspace <p>]`. The script AJV-validates against `flow.schema.json` and increments `counts.flows` in the manifest. Scenarios in `matrix.{md,json}` are still authored by this command; the script only handles flow record emission.
6. Write `_testatlas/tests/matrix.md` (human-readable scenario table grouped by domain and type) and `_testatlas/tests/matrix.json` (bundled index, validating against `matrix.schema.json`).
7. Write `_testatlas/tests/exploratory_charters.md` — time-boxed exploratory testing missions per PRD §26. Each charter names a domain, a duration, a focus area, and an oracle.
8. For scenarios that target capabilities not declared by the current adapter (e.g. `browser` not declared but the scenario needs it), mark `pending: capability-required` and exclude them from the dogfood-loop run rather than dropping them. Record the unmet capability so the operator can swap adapters.
9. Validate `matrix.json` against `matrix.schema.json` and every per-scenario sidecar against `test-scenario.schema.json` before closing. If any validation fails, halt — do not commit a partial matrix.
10. Close the lifecycle (next section).

## Sub-Agent Orchestration

Detect host capability `subagent-spawn` per `bootstrap.md`'s Capability Degradation section (per-host invocation table). Then:

**If `subagent-spawn` is available:**
For each domain entry in `_testatlas/domains/<slug>/domain.{md,json}` (one risk-analysis sub-agent per domain):
  Spawn a sub-agent with this brief (markdown convention):
    - **objective:** "Identify test risks and prioritize coverage for `<domain>`."
    - **scope:** "All product features mapped to `<domain>` in `_testatlas/domains/<slug>/domain.{md,json}` and the per-domain index in `_testatlas/01_system_map.md`."
    - **files-to-read:** "`_testatlas/domains/<slug>/domain.{md,json}` (the target domain); `_testatlas/01_system_map.md`; `_testatlas/02_product_overview.md`; the relevant `explore-*` findings under `_testatlas/evidence/`; prior `_testatlas/to_fix/` issues touching the domain."
    - **output-format:** "Markdown risk list with severity-tagged entries (one per identified risk) plus draft `test-scenario` JSON fragments validating against `test-scenario.schema.json`."
    - **may-write:** sub-agent MUST NOT write to `_testatlas/` directly; the umbrella aggregates risks + scenarios and writes `02_test_strategy.md`, `plans/PLAN-master.md`, and `tests/matrix.{md,json}`.
    - **exit-criteria:** "Risks ranked; uncovered surface flagged; scenarios drafted; ready for matrix synthesis."
Run all sub-agents in parallel. Wait for all to complete.
Merge structured results into the strategy + master plan + scenario matrix.
Mark the run record `executionMode: 'parallel-subagents'`.

**Else (sequential fallback):**
For each domain sequentially in this thread:
  Perform the per-domain risk analysis inline following the same brief above.
  Capture output.
Synthesize results into the umbrella output.
Mark the run record `executionMode: 'sequential-fallback'`.

**Threshold guard:** if applicable domain count is `< 2` after filtering, run inline regardless of capability (degenerate single-spawn is wasted overhead).

## Outputs

- `_testatlas/02_test_strategy.md` — one-page strategy framing.
- `_testatlas/plans/PLAN-master.md` — prioritized master scenario list (P0 → P2).
- `_testatlas/tests/matrix.md` and `_testatlas/tests/matrix.json` — schema-valid scenario matrix.
- `_testatlas/tests/exploratory_charters.md` — exploratory testing charters.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record scenario count, P0 count, and any `pending: capability-required` deferrals.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (matrix + plan + strategy + charters must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; update `counts.scenarios` and `counts.charters`.
- `_testatlas/history/run_log.md` — narrative entry: "Planned `<n>` scenarios across `<n>` domains; `<n>` P0, `<n>` deferred for missing capabilities."

## Stop Conditions

- No domains exist (`_testatlas/domains/` empty) → halt; "Run /atlas:map-domains first." Strategy without domains is unmoored.
- More than 500 scenarios planned in a single run → halt; require operator review (almost always over-scoping; risk-prioritization is failing).
- `matrix.schema.json` or `test-scenario.schema.json` validation fails on any entry → halt; do not commit a partial matrix.
- All scenarios marked `pending: capability-required` (zero runnable) → halt; require operator to swap adapter or revise scope.

## Completion Criteria

- All four plan artifacts exist: `02_test_strategy.md`, `plans/PLAN-master.md`, `tests/matrix.{md,json}`, `tests/exploratory_charters.md`.
- `matrix.json` validates against `matrix.schema.json`; every per-scenario sidecar validates against `test-scenario.schema.json`.
- Every scenario carries an explicit `confidence` per `bootstrap.md` §11.
- Manifest `counts.scenarios` and `counts.charters` match on-disk counts.
- The five lifecycle files listed above are updated.

## What's Next

Now that the test plan exists:

- **`/atlas:test-flow`** — execute scenarios end-to-end with evidence capture
- **`/atlas:test-domain`** — execute one full domain at a time when scope is large
- **`/atlas:log-issue`** — file blocking issues surfaced during planning
- **`/atlas:council-test-plan`** — ratify the test matrix this plan produces via council protocol.
- **`/atlas:test-generate-scenarios`** — materialize the plan into concrete generated test scenarios.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
