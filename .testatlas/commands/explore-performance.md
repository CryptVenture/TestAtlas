---
command: explore-performance
version: 1.0.0
description: Detect user-visible slowness, blocking interactions, retries, reliability per PRD §13.10 via mandatory Chrome DevTools MCP perf walkthrough (baseline + throttled traces, performance_analyze_insight); degrade to code-reading without MCP.
capabilities: [browser, MCP, shell, file-write]
produces:
  - evidence
  - command-result
consumes:
  - app-map
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT navigate to production hosts when allowProductionTesting=false. Does NOT trigger destructive flows during traces. Does NOT fabricate trace data, throttling profiles, or timing metrics when MCP/browser/shell unavailable — degrade per bootstrap §4.
---

# TestAtlas Command: explore-performance

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read `{{ADAPTER_COMMAND_PATH}}` completely (already loaded into your context if invoked via slash).
3. Inspect `./_testatlas/11_workspace_manifest.json` if it exists.
4. Inspect the canonical files required by this command.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Detect user-visible performance issues per PRD §13.10: slow first paint, long tasks, layout shifts, network waterfall hot spots, retried/failed requests, reliability under throttling. Drive Chrome DevTools MCP traces against the routes in `_testatlas/12_app_map.json` — unthrottled and throttled — and persist evidence under `_testatlas/evidence/explore-performance/<timestamp>/`. Findings carry PRD §13.10 severity (critical / serious / moderate / minor) plus confidence per `bootstrap.md` §8. Every finding MUST cite an evidence path that exists on disk.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` § *Performance walkthrough* — canonical perf walkthrough (baseline + throttled traces, Web Vitals assertions, network waterfall + retry inventory). The mandatory-when-available contract lives there.
- `_testatlas/11_workspace_manifest.json` — confirm initialization and counts.
- `_testatlas/12_app_map.json` — route entries (with traffic hints if present) to sample.
- `_testatlas/00_overview.md` — runtime metadata: how to start the local dev server (command, port, health endpoint).
- `prd/prd.md` §13.10 — must-discover items the audit must address.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting`, performance thresholds if defined.
- `.testatlas/schemas/evidence.schema.json` — evidence sidecar shape.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Audit performance — page weight, bundle size, Core Web Vitals (LCP / INP / CLS), runtime bottlenecks — against declared performance budgets for the target product.
- **scope:** A representative sample of routes from `_testatlas/12_app_map.json` (defaults: top traffic-hint routes if present, otherwise the index route plus highest-fan-in templates). Excludes load-testing of production hosts.
- **files-to-read:** `_testatlas/12_app_map.json`; `_testatlas/00_overview.md` (local dev server start command + port + health endpoint); `prd/prd.md` §13.10 (performance must-discover items); `.testatlas/default.config.json` (`safeMode`, `allowDestructiveActions`, `allowProductionTesting`, declared performance thresholds); `.testatlas/schemas/evidence.schema.json`.
- **output-format:** Markdown findings list with budget-pass/fail per measurement and one entry per measurable performance budget. Evidence (Lighthouse JSON, network HARs, bundle-size reports, profile traces) under `_testatlas/evidence/explore-performance/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** All measurable performance budgets evaluated against captured evidence; gaps in measurement coverage explicitly listed; no synthetic findings without backing evidence; production hosts skipped when `allowProductionTesting=false`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-performance/<timestamp>/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities and degrade per `bootstrap.md` §4:
   - **If `MCP` or `browser` is unavailable, MUST NOT produce runtime performance findings — fall back to source-code reading via `app-map` (`12_app_map.json`) and the source files it references (look for known anti-patterns: N+1 queries, unbatched fetches, blocking sync IO, oversized bundles, missing memoization, unawaited promises in render). Mark every finding `confidence: needs-validation` and add `tool_unavailable: <MCP|browser>` per `bootstrap.md` §4. Never invent trace timings, LCP/INP/CLS scores, throttling profiles, or network waterfalls from training-data priors.**
   - **If `shell` is unavailable, MUST NOT start the local dev server — fall back to a deployed sandbox URL recorded in `_testatlas/00_overview.md` and mark findings `confidence: needs-validation`. If neither shell nor a sandbox URL is available, halt via stop condition.**
3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available in this adapter context (verified per `.testatlas/reference/capabilities.md` per-capability action matrix), this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Performance walkthrough* — baseline trace + throttled trace per sampled route, with `performance_analyze_insight` against PRD §13.10 thresholds (LCP <= 2500ms, INP <= 200ms, CLS <= 0.1, totalBlockingTime <= 300ms). Skipping a walkthrough step when the tool is reachable — because the result feels predictable, priors say the route is fast, or coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the route returns an error after retry, `performance_start_trace` rejects with attached-target-lost), record the skip rationale on the resulting findings entry. MUST NOT skip silently.
4. Verify safety flags. If the resolved target URL is a production host and `allowProductionTesting=false`, halt — never run perf traces against production. Inspect resolved URLs, not author-claimed environments.
5. (If `shell` is available) Start the local dev server per `_testatlas/00_overview.md` runtime metadata. Wait for the documented health-check (HTTP 200 on `/health` or equivalent). Persist the startup log under `_testatlas/evidence/explore-performance/<timestamp>/dev-server.log`.
6. Connect to Chrome DevTools MCP and confirm the performance toolset (verbatim names):
   - `navigate_page(url)` — load a target route under instrumentation.
   - `wait_for(condition)` — wait for the route to settle.
   - `performance_start_trace(...)` / `performance_stop_trace()` — bracket a trace capture.
   - `performance_analyze_insight(...)` — derive LCP, INP, CLS, long tasks, render-blocking, layout shifts.
   - `emulate({cpuThrottlingRate, networkConditions})` — CPU + network throttling profiles.
   - `list_network_requests()` — XHR/fetch traffic with timing, status, retries, payload size.
   - `list_console_messages()` — surface runtime errors and warnings emitted during the trace window.
7. Select a representative route set: the home/landing route plus the 2–3 most-trafficked routes from `_testatlas/12_app_map.json` (or, absent traffic hints, the routes most central to the dogfood-loop's primary user flow). Record the rationale in `route-selection.md`.
8. For each selected route, capture a baseline trace: `navigate_page` → `wait_for` settle → `performance_start_trace` → exercise the primary user interaction (click, fill, submit) → `performance_stop_trace`. Persist the trace JSON under `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/baseline.trace.json`.
9. For each selected route, capture a throttled trace: call `emulate({cpuThrottlingRate: 4, networkConditions: 'Slow 3G'})` (or the equivalent profile name supported by the MCP build), repeat the baseline interaction sequence, and persist as `throttled.trace.json`. This is the reliability surface — slow CPUs and bad networks reveal the failures real users hit.
10. Run `performance_analyze_insight` against each captured trace. Persist insights (LCP, INP, CLS, total-blocking-time, long tasks, render-blocking resources, layout-shift sources) as `insights.md` per route, alongside the underlying machine-readable JSON when the tool returns one.
11. Capture the network inventory via `list_network_requests` for each trace, recording: URL, method, status, duration, payload size, and retry count. Persist as `network.json` per route. Highlight retried/failed requests, slow third-party calls, and unbatched requests.
12. Aggregate findings into `_testatlas/evidence/explore-performance/<timestamp>/findings.md` with severity per PRD §13.10 (critical / serious / moderate / minor), explicit threshold rationale (which budget the observed value violated), and confidence per `bootstrap.md` §8. Every finding cites at least one evidence path created in steps 8–11.
13. (If a dev server was started) Stop it cleanly. Record exit status in `dev-server.log`.
14. Close the lifecycle (next section).

## Outputs

- `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/baseline.trace.json` — unthrottled trace per audited route.
- `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/throttled.trace.json` — CPU + network throttled trace per audited route.
- `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/insights.md` — LCP / INP / CLS / long-task / render-blocking / layout-shift findings per route.
- `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/network.json` — request inventory with retry counts and payload sizes.
- `_testatlas/evidence/explore-performance/<timestamp>/route-selection.md` — which routes were sampled and why.
- `_testatlas/evidence/explore-performance/<timestamp>/dev-server.log` — startup + shutdown log when `shell` was used.
- `_testatlas/evidence/explore-performance/<timestamp>/findings.md` — aggregated findings with severity, threshold rationale, and evidence paths.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, sampled route count, and findings count by severity.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "Performance-traced `<n>` routes (baseline + throttled) — `<n>` critical / `<n>` serious / `<n>` moderate / `<n>` minor findings."

## Stop Conditions

- `_testatlas/12_app_map.json` missing or contains zero routes → halt; recommend `/atlas:explore-codebase` first.
- Both `MCP` AND `browser` unavailable → halt; this command requires runtime observation.
- `shell` unavailable AND no deployed sandbox URL recorded in `_testatlas/00_overview.md` → halt; nothing to trace against.
- Dev server fails to start (port conflict, missing dependency, migration failure) AND no sandbox URL → halt; surface the startup log.
- Resolved target URL is a production host but `allowProductionTesting=false` → halt; refuse to trace.
- Trace capture fails for ALL sampled routes → halt and surface as an MCP / target-runtime issue; do not commit synthetic findings.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- Every sampled route has at least one `baseline.trace.json` AND one `throttled.trace.json` on disk.
- `insights.md` and `network.json` exist per sampled route.
- `findings.md` exists and lists each finding with severity, threshold rationale, confidence, and at least one evidence path.
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that the performance baseline is captured:

- **`/atlas:test-performance`** — execute targeted perf scenarios against the worst offenders
- **`/atlas:plan`** — fold perf findings into the test plan
- **`/atlas:log-issue`** — file individual issues for high-severity budget violations
