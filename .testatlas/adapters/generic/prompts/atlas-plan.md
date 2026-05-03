<!-- TestAtlas command: atlas-plan. Paste .testatlas/bootstrap.md first; description: Produce a risk-based, domain-based, flow-based, state-aware test strategy and master plan covering 02_test_strategy.md, plans/PLAN-master.md, the test matrix, and exploratory charters per PRD §12.14. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/plan.md" hash="6c61969ba78aabc7" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Produce a test strategy and master plan: `_testatlas/02_test_strategy.md`, `_testatlas/plans/PLAN-master.md`, `_testatlas/tests/matrix.md` + `matrix.json`, and `_testatlas/tests/exploratory_charters.md` per PRD §12.14. Strategy is risk-based, domain-based, flow-based, and state-aware. Output is reasoning-derived (a plan, not a finding); per-scenario confidence is governed by `bootstrap.md` §11 (claim-confidence rule), not §8 (evidence rule).

## Required First Reads

- `.testatlas/bootstrap.md` — especially §11 (claim-confidence) and §4 (capability degradation).
- `_testatlas/12_app_map.json` — what surfaces exist to test.
- `_testatlas/domains/*/domain.json` — every domain `map-domains` produced; the unit of test planning.
- `_testatlas/flows/` — any flows recorded by prior runs (used to derive flow-targeted scenarios).
- `_testatlas/to_fix/` — any prior issues; closed/active issues feed regression scenarios.
- `.testatlas/schemas/test-scenario.schema.json` — required JSON shape per scenario in `matrix.json`.
- `.testatlas/default.config.json` — currently declared adapter capabilities (used to gate scenarios per step 8).

## Required Actions

1. Identify high-risk surfaces. Cross-reference signals: domains with the most routes/APIs (blast radius), integrations marked sandbox vs production (regression risk), flows with state-coverage gaps (PRD §13 — empty/loading/error/success/permission), and surfaces that have produced prior issues. Rank surfaces by an explicit risk score; record the scoring rationale in `02_test_strategy.md`.
2. For each domain, generate test scenarios per PRD §26 test types. The dogfood loop targets `smoke` first; mark scenarios for `regression`, `exploratory`, `negative`, `state`, `accessibility`, `performance`, `security`, `data-integrity`, and `user-flow` as deferred to Phase-4 commands and assign them to subsequent runs rather than the immediate matrix.
3. Each scenario MUST include: a stable scenario id, name, type, target flow and/or domain, preconditions (workspace + product state), steps (numbered, evidence-attaching), expected behaviour, evidence-to-capture (which states, what artifacts), capability requirements (`shell`, `browser`, `web-fetch`, `MCP`), priority (P0/P1/P2), and a per-scenario `confidence` per `bootstrap.md` §11 reflecting how well the underlying domain evidence supports the scenario's premise.
4. Write `_testatlas/02_test_strategy.md` — a one-page strategy framing: scope, risk model, test-type mix, capability-availability assumptions, success thresholds, and explicit out-of-scope items.
5. Write `_testatlas/plans/PLAN-master.md` — the prioritized master scenario list (P0 → P1 → P2). Each row links to its `matrix.json` entry by id and notes the next command (`/atlas:test-flow`, etc.) that will execute it.
6. Write `_testatlas/tests/matrix.md` (human-readable scenario table grouped by domain and type) and `_testatlas/tests/matrix.json` (one entry per scenario, each validating against `test-scenario.schema.json`).
7. Write `_testatlas/tests/exploratory_charters.md` — time-boxed exploratory testing missions per PRD §26. Each charter names a domain, a duration, a focus area, and an oracle.
8. For scenarios that target capabilities not declared by the current adapter (e.g. `browser` not declared but the scenario needs it), mark `pending: capability-required` and exclude them from the dogfood-loop run rather than dropping them. Record the unmet capability so the operator can swap adapters.
9. Validate every entry in `matrix.json` against `test-scenario.schema.json` before closing. If any entry fails, halt — do not commit a partial matrix.
10. Close the lifecycle (next section).

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
- `test-scenario.schema.json` validation fails on any entry → halt; do not commit a partial matrix.
- All scenarios marked `pending: capability-required` (zero runnable) → halt; require operator to swap adapter or revise scope.

## Completion Criteria

- All four plan artifacts exist: `02_test_strategy.md`, `plans/PLAN-master.md`, `tests/matrix.{md,json}`, `tests/exploratory_charters.md`.
- Every scenario in `matrix.json` validates against `test-scenario.schema.json`.
- Every scenario carries an explicit `confidence` per `bootstrap.md` §11.
- Manifest `counts.scenarios` and `counts.charters` match on-disk counts.
- The five lifecycle files listed above are updated.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
