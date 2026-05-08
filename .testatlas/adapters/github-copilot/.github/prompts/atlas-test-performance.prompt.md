---
mode: agent
description: Execute performance-typed scenarios via mandatory Chrome DevTools MCP perf walkthrough (baseline + throttled traces, performance_analyze_insight, emulate); assert PRD §13.10 thresholds; emit RUN-<timestamp>.{md,json} with perf findings.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test-performance.md" hash="304a326fbf2d610400138856493fae81176af6fe833cdd08bf8f7c1d7c7c6a59" -->
First read `.testatlas/bootstrap.md`. Then read `.github/prompts/atlas-test-performance.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Execute scenarios with `type === "performance"` from `_testatlas/tests/matrix.json` per PRD §26.8 — a Chrome DevTools MCP-driven trace + emulate run that asserts each scenario against PRD §13.10 thresholds (LCP, INP, CLS, total blocking time, network request counts, retry counts, long-task budget). Output is a `_testatlas/tests/runs/RUN-<timestamp>.{md,json}` pair tagged `type: "performance"` (the JSON validates against `test-run.schema.json`) plus per-scenario evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/performance/` (baseline trace, throttled trace, performance insights, network captures, screenshots). Every claim about performance behaviour MUST be backed by trace data captured first; degrading without MCP/browser/shell MUST mark findings `confidence: needs-validation`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` § *Performance walkthrough* — canonical perf walkthrough (baseline + throttled trace per scenario, Web Vitals threshold assertions). The mandatory-when-available contract lives there.
- `_testatlas/tests/matrix.json` — performance-typed scenarios; if none, halt.
- `_testatlas/00_overview.md` — runtime metadata (how to start the local dev server, ports, health-check endpoint).
- `.testatlas/default.config.json` — `allowProductionTesting`, `safeMode` flags; default perf thresholds.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every metric this command reports MUST cite a trace, network capture, or insight file path under `_testatlas/evidence/runs/<run-id>/<scenario-id>/performance/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. **If `MCP` is unavailable, MUST NOT produce runtime performance findings — fall back to source-code reading via `_testatlas/12_app_map.json` and the source files it references (look for bundle imports, network call patterns, lazy-loading, image sizing). Mark every finding `confidence: needs-validation`. Add `tool_unavailable: MCP` to each artifact per `bootstrap.md` §4. Never invent trace timings, throttling profiles, LCP / INP / CLS scores, or long-task counts from training-data priors.** **If `browser` is unavailable, MUST NOT navigate or capture runtime traces — fall back to source-code reading per the same rules; mark findings `confidence: needs-validation`; add `tool_unavailable: browser` per `bootstrap.md` §4. Never simulate Web Vitals from training-data priors.** **If `shell` is unavailable, MUST NOT start the local dev server — fall back to a deployed sandbox URL when present in `_testatlas/00_overview.md`, or mark every scenario `skipped: shell unavailable` and add `tool_unavailable: shell` per `bootstrap.md` §4.** If both `MCP` AND `browser` are unavailable, halt via stop condition.
3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available in this adapter context (verified per `.testatlas/reference/capabilities.md` per-capability action matrix), this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Performance walkthrough* for every performance-typed scenario in scope — baseline pass + throttled pass with `performance_analyze_insight` against the scenario's declared thresholds (default PRD §13.10: LCP <= 2500ms, INP <= 200ms, CLS <= 0.1, totalBlockingTime <= 300ms). Skipping a walkthrough step when the tool is reachable — because the result feels predictable, priors say the scenario will pass, or coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (route lacks the primary interaction the scenario specifies, `performance_start_trace` transport error after retry), record the skip rationale on the per-scenario result. MUST NOT skip silently.
4. Verify safety flags. If the resolved target URL is a production host and `allowProductionTesting=false`, halt — do not navigate. Inspect resolved URLs, not author-claimed environments. Refuse any scenario whose primary interaction would trigger destructive side-effects mid-trace.
5. **Start the target.** If `shell` is available and the scenario targets a local dev server, run the start command from `_testatlas/00_overview.md`, wait for the health-check endpoint to return ready, then proceed. If the start command fails AND no sandbox URL is configured, halt via stop condition.
6. Connect to Chrome DevTools MCP and confirm the canonical performance toolset is reachable. The required tools (verbatim names) are:
   - `navigate_page(url)` — load the scenario's target route.
   - `wait_for(condition)` — block on selector / text / network-idle before starting the trace.
   - `performance_start_trace(...)` — begin recording the performance trace.
   - `performance_stop_trace()` — end recording and return the trace artifact.
   - `lighthouse_audit(...)` — supplemental Web Vitals capture for cross-check against the trace insights (optional but recommended on the baseline pass).
   - `performance_analyze_insight(...)` — derive per-insight summaries (LCP, INP, CLS, long tasks, render blocking).
   - `emulate({cpuThrottlingRate, networkConditions})` — apply throttling for the second pass.
   - `take_snapshot()` — capture the rendered DOM at the trace boundary so the LCP target is identifiable.
   - `list_network_requests()` — capture XHR / fetch / static-asset traffic; emit retry counts and waterfall.
   - `evaluate_script(js)` — read `performance.timing` / `PerformanceObserver` entries when needed for cross-checks.
7. **Per scenario — two passes per scenario.** For each performance-typed scenario:
   a. **Baseline pass.** Navigate, `wait_for` settle, `performance_start_trace`, exercise the scenario's primary interaction, `performance_stop_trace`. Persist the trace as `baseline-trace.json`. Run `performance_analyze_insight` and persist as `baseline-insights.json`. Optionally run `lighthouse_audit` (performance category) and persist as `lighthouse.json`. Capture `list_network_requests` as `baseline-network.json`. Capture `take_snapshot` as `baseline-snapshot.json` and `take_screenshot` as `baseline.png`.
   b. **Throttled pass.** `emulate({cpuThrottlingRate: 4, networkConditions: 'Slow 3G'})` (or the scenario's declared throttle profile). Repeat the navigate / trace / insight / network / snapshot capture. Persist as `throttled-trace.json`, `throttled-insights.json`, `throttled-network.json`, `throttled-snapshot.json`, `throttled.png`.
   c. Save all evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/performance/`.
8. **Threshold assertion.** Compare the captured insights against the scenario's expected thresholds (per the PRD §13.10 defaults named in Required Action 3, plus any per-scenario overrides for `requestCount`, `retryCount`, `longTasks`). Apply thresholds separately for baseline and throttled passes when the scenario specifies both. Status is `passed` / `failed` / `skipped` / `blocked`. Each per-result `confidence` per `bootstrap.md` §8.
9. Write `_testatlas/tests/runs/RUN-<timestamp>.md` (human narrative — one section per scenario, baseline metrics first then throttled) and `_testatlas/tests/runs/RUN-<timestamp>.json` with `type: "performance"`. Include a top-level summary: total / passed / failed / skipped / blocked, capabilities used, capabilities unavailable, environment fingerprint, throttle profile applied.
10. Validate the produced RUN JSON against `test-run.schema.json` before commit. Halt if validation fails.
11. Close the lifecycle (next section).

## Outputs

- `_testatlas/tests/runs/RUN-<timestamp>.md` and `_testatlas/tests/runs/RUN-<timestamp>.json` — performance-typed run record with per-scenario results, threshold assertions, and evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/performance/` — baseline + throttled traces, insights, network captures, snapshots, screenshots.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total / passed / failed / skipped / blocked, throttle profile, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair and evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by one; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (test-performance) — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked across `<n>` perf scenarios; throttle `<profile>`."

## Stop Conditions

- `_testatlas/tests/matrix.json` missing or contains zero performance-typed scenarios → halt; "No perf scenarios in scope."
- Both `MCP` AND `browser` unavailable → halt; this command requires at least one runtime observation surface.
- Local dev server fails to start AND no sandbox URL configured → halt; cannot trace a non-running target.
- Resolved target URL is a production host but `allowProductionTesting=false` → halt; refuse to navigate.
- `performance_start_trace` / `performance_stop_trace` fails for ALL scenarios (transport error, attached-target lost, MCP version mismatch) → halt and surface as an MCP / target-runtime issue; do not commit synthetic findings.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Evidence file referenced in a result does not exist on disk after capture → halt; do not record a result citing a non-existent path.
- `test-run.schema.json` validation fails on the produced JSON → halt; do not commit a malformed run.

## Completion Criteria

- Every performance-typed scenario has both a baseline trace + insights and a throttled trace + insights on disk under `_testatlas/evidence/runs/<run-id>/<scenario-id>/performance/`.
- Threshold assertions are applied against captured insight values, not extrapolated.
- The RUN JSON validates against `test-run.schema.json` and includes the throttle profile applied.
- Manifest `counts.runs` and `counts.evidence` are updated to match disk.
- The five lifecycle files listed above are updated.

## What's Next

Now that performance scenarios have run:

- **`/atlas:log-issue`** — file individual issues for budget violations
- **`/atlas:triage`** — assess severity and ownership across the perf queue
- **`/atlas:retest`** — re-run failing scenarios after a fix lands
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
