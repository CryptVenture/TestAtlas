---
description: Execute scenarios from tests/matrix.json against running target via mandatory Chrome DevTools MCP interactive-surface walkthrough (forms, modals, navigation, keyboard); capture per-state evidence; emit RUN-<timestamp>.{md,json} per PRD §13.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, mcp__*
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test-flow.md" hash="a8b35d345ab57e30d00f7e69a18295142a27bb0d6dd947523c65282f76051a45" -->
First read `.testatlas/bootstrap.md`. Then read `.claude/commands/atlas-test-flow.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Execute test scenarios from `_testatlas/tests/matrix.json` against the running target product. Capture evidence (screenshots, logs, network traces, console output, server traces) per PRD §13 and write `RUN-<timestamp>.{md,json}` (validates against `test-run.schema.json`) recording per-state coverage (empty / loading / error / success / permission) and per-scenario pass/fail/skipped/blocked status. Highest-risk fabrication surface — every claim MUST cite evidence captured first.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §8 (no-evidence-no-finding) and §4 (capability degradation).
- `.testatlas/reference/chrome-devtools-mcp.md` § *Interactive-surface walkthrough* — canonical walkthrough for forms, modals, navigation, keyboard paths. The mandatory-when-available contract lives there.
- `_testatlas/tests/matrix.json` — the planned scenarios; if missing, halt.
- `_testatlas/flows/<slug>/flow.{md,json}` for each flow under test — preconditions, expected paths, oracle.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. `shell` for runners/processes; `browser` + `MCP` for UI flows. **If `shell` is unavailable, MUST NOT execute scenarios requiring shell — mark them `skipped: shell unavailable` per `bootstrap.md` §4. If `browser` is unavailable, MUST NOT execute UI scenarios — mark them `skipped: browser unavailable` per `bootstrap.md` §4. If `MCP` is unavailable, MUST NOT execute UI scenarios — mark them `skipped: MCP unavailable` per `bootstrap.md` §4 and add `tool_unavailable: MCP`.** Never simulate browser interactions from training-data priors.
3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available in this adapter context (verified per `.testatlas/reference/capabilities.md` per-capability action matrix), this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Interactive-surface walkthrough* for every UI-touching scenario in scope — forms with validation matrix, modals with tab-trap + Escape dismiss, navigation reachability sampling, keyboard-path traversal. Pre-register `handle_dialog({action: "accept"})` (or `{action: "dismiss"}`) BEFORE any action that may open `alert` / `confirm` / `beforeunload` — the Chrome DevTools MCP API uses `{action: "accept"|"dismiss"}`, not a boolean `accept`. Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, priors say the form will validate, or coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the scenario does not declare a primary form, the modal has no focusable controls), record the skip rationale on the per-scenario result. MUST NOT skip silently.

   The interactive-surface canonical toolset (verbatim):
   - `navigate_page(url)` / `wait_for(condition)` — settle target before observation.
   - `handle_dialog({action: "accept"|"dismiss", promptText?})` — pre-register dialog handler before any action that may open `alert` / `confirm` / `beforeunload`. The MCP API takes `{action}` (not boolean `accept`).
   - `take_snapshot()`, `take_screenshot()` — DOM + visual evidence per state observed.
   - `click(selector)`, `fill_form({fields})`, `press_key(key)` — primary interaction set.
   - `hover(selector)`, `type_text(selector, text)`, `upload_file(selector, path)` — extended interaction set; required when scenario steps reference tooltips, IME-sensitive inputs, or file uploads.
   - `evaluate_script(js)` — read focus state, computed labels, ARIA attributes when scenario asserts on those.
   - `list_console_messages()`, `list_network_requests()` — capture diagnostics evidence.
4. Verify safety flags. If `allowDestructiveActions=false`, refuse scenarios marked destructive (data deletion, irreversible mutations, payment captures). If `allowProductionTesting=false`, refuse scenarios whose target environment resolves to production (production hostnames, live API keys); inspect resolved URLs / env names rather than scenario-author claims.
5. For each scenario, execute steps in order. Capture evidence at every user-visible state required by the scenario plus the canonical PRD §13 set (empty, loading, error, success, permission). Persist under `_testatlas/evidence/runs/<run-id>/<scenario-id>/` BEFORE any pass/fail claim. Use stable, self-describing names (`step-03-success.png`, `network-har.json`, `console.log.txt`).
   - **Preferred path for evidence sidecars (if `shell` is available):** run `node .testatlas/scripts/create-evidence-record.js --file <path> [--redacted] [--workspace <p>]`. The script content-hashes, allocates `EVIDENCE-<id>`, AJV-validates, and writes the sidecar pair. Manual path: hand-author per `evidence.schema.json`.
6. For each scenario record: id, name, type, status (`passed`/`failed`/`skipped`/`blocked`), state-coverage observed (which of the 5 PRD §13 states), evidence paths (under `_testatlas/evidence/runs/<run-id>/`), observed vs expected, deltas, and `confidence` per `bootstrap.md` §8.
7. Write `_testatlas/tests/runs/RUN-<timestamp>.{md,json}`. Include top-level summary: total / passed / failed / skipped / blocked, capabilities used, capabilities unavailable, environment fingerprint.
8. Do NOT auto-log issues — the operator (or `/atlas:log-issue`) decides. MAY append `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` with issue candidates and preselected evidence paths so `log-issue` can adopt them quickly.
9. Update flow confidence per scenario outcomes — passes climb; failures/skips drop and are flagged for re-test next plan cycle.
10. Validate the produced RUN JSON against `test-run.schema.json` before closing. Halt on validation failure — do not commit a malformed run.
11. Close the lifecycle (next section).

### `--all` mode

`/atlas:test-flow --all` walks flows referenced by ≥1 scenario in the matrix (flows with zero scenarios are skipped silently), and accumulates results into ONE merged RUN with `executionMode: 'all-flows'` in metadata. Capability-blocked or `pending: capability-required` scenarios are `status: 'skipped'` with `skipReason`; `--all` MUST NOT halt on first skip. Halt only when every in-scope scenario was skipped with non-user-recoverable reasons.

## Sub-Agent Orchestration

Detect host capability `subagent-spawn` per `bootstrap.md`'s Capability Degradation section. Then:

**Independence guard (enforced first):** if any flow in the requested set shares state with another (setup → flow → teardown chain, shared fixture mutation, ordered DB seeding), MUST run sequentially — parallel execution would corrupt evidence. Only flows with no shared state mutation are eligible for parallel spawn.

**If `subagent-spawn` is available AND flows are independent:** for each independent flow, spawn a sub-agent with brief:
- **objective:** "Execute `<flow-name>` against the target product and capture per-state evidence."
- **scope:** "Actions, assertions, and PRD §13 states defined in the flow file."
- **files-to-read:** "`_testatlas/flows/<flow-name>/flow.{md,json}`; matrix entries for the flow; referenced fixtures; `test-run.schema.json` and `evidence.schema.json`."
- **output-format:** "`RUN-<timestamp>.{md,json}` per `test-run.schema.json`; evidence under `_testatlas/evidence/runs/<run-id>/<flow-name>/`."
- **may-write:** evidence files + per-flow run record. MUST NOT write to `_testatlas/to_fix/` — the umbrella aggregates candidates into the optional `RUN-<timestamp>.suggestions.md`.
- **exit-criteria:** run record persisted; evidence redacted; schema validation passes.

Run sub-agents in parallel. Merge structured results. Mark run record `executionMode: 'parallel-subagents'`.

**Else (sequential fallback — also taken when flows share state):** execute each flow inline following the brief above. Synthesize results. Mark `executionMode: 'sequential-fallback'`.

**Threshold guard:** if applicable flow count is `< 2`, run inline regardless of capability.

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `_testatlas/tests/runs/RUN-<timestamp>.json` — schema-valid run record with per-scenario results, state coverage, evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/` — captured screenshots, logs, network traces, console output, server traces for every executed scenario.
- Optional `_testatlas/tests/runs/RUN-<timestamp>.suggestions.md` — advisory issue candidates for `/atlas:log-issue`.
- Updated flow confidence in `_testatlas/flows/<slug>/flow.json` for every flow touched by this run.

## Lifecycle

After completing, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total/passed/failed/skipped/blocked counts, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair + evidence directory).
- `_testatlas/10_command_log.md` — append a row per `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — entry: "RUN-`<timestamp>` executed `<n>` scenarios — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked."

## Stop Conditions

- `_testatlas/tests/matrix.json` missing → halt; "Run /atlas:plan first."
- All scenarios skipped due to missing capabilities → halt; require operator to enable capabilities or swap adapter.
- Production target detected but `allowProductionTesting=false` → halt; refuse to run. Never override a safety flag in-process.
- `safeMode=true` and a step would mutate target-repo source files → halt.
- Evidence path cited in a result does not exist on disk → halt.
- `test-run.schema.json` validation fails → halt; do not commit a malformed run.
- `--all` mode halts only when every in-scope scenario is skipped with non-user-recoverable reasons.

## Completion Criteria

- At least one `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` pair exists, or unambiguous justification for zero (all scenarios legitimately skipped) recorded in the summary.
- Every recorded result cites evidence paths that exist on disk under `_testatlas/evidence/runs/<run-id>/`.
- RUN JSON validates against `test-run.schema.json`.
- Manifest `counts.runs` and `counts.evidence` match disk.
- Flow confidence updated for every flow touched.
- The five lifecycle files updated.

## What's Next

Now that the flow run is complete:

- **`/atlas:log-issue`** — file individual issues for failing scenarios
- **`/atlas:retest`** — rerun failing scenarios after fixes land
- **`/atlas:report`** — fold the run into the next aggregate report
- **`/atlas:council-flow-review`** — escalate flow execution findings to a council quality gate.
- **`/atlas:test-generate-automation`** — produce reproducible automation scaffolds from this flow.
- **`/atlas:test-all`** — run every flow + every domain in one orchestrated sweep, aggregating per-child runs into a single merged RUN-<timestamp>.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
