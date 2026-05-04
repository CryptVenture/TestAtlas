---
name: atlas-explore-performance
description: Detect user-visible slowness, blocking interactions, retries, and reliability per PRD §13.10 using Chrome DevTools MCP performance traces + emulate for throttling; degrade to source-code reading without MCP.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-performance.md" hash="64e2dabd89ddfbb9" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Detect user-visible performance issues per PRD §13.10: slow first paint, blocking long tasks during interaction, layout shifts, network waterfall hot spots, retried/failed requests, and reliability under throttled conditions. Drive Chrome DevTools MCP performance traces against the routes catalogued in `_testatlas/12_app_map.json`, both unthrottled and throttled (CPU + network), and persist evidence under `_testatlas/evidence/explore-performance/<timestamp>/` (trace JSONs, insights, network captures, threshold reports). Findings are scored per PRD §13.10 severity (critical / serious / moderate / minor) with explicit threshold rationale, and confidence per `bootstrap.md` §8. This command is finding-producing — every finding MUST cite an evidence path that exists on disk.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/11_workspace_manifest.json` — confirm initialization and counts.
- `_testatlas/12_app_map.json` — route entries (with traffic hints if present) to sample.
- `_testatlas/00_overview.md` — runtime metadata: how to start the local dev server (command, port, health endpoint).
- `prd/prd.md` §13.10 — must-discover items the audit must address.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting`, performance thresholds if defined.
- `.testatlas/schemas/evidence.schema.json` — evidence sidecar shape.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-performance/<timestamp>/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities and degrade per `bootstrap.md` §4:
   - **If `MCP` is unavailable, MUST NOT produce runtime performance findings — fall back to source-code reading via `app-map` (`12_app_map.json`) and the source files it references (look for known anti-patterns: N+1 queries, unbatched fetches, blocking sync IO, oversized bundles, missing memoization, unawaited promises in render). Mark every finding `confidence: needs-validation`. Add `tool_unavailable: MCP` to each artifact per `bootstrap.md` §4. Never invent trace timings, LCP/INP/CLS scores, throttling profiles, or network waterfalls from training-data priors.**
   - **If `browser` is unavailable, MUST NOT navigate, capture traces, or sample network — fall back to source-code reading per the same rules; mark findings `confidence: needs-validation`; add `tool_unavailable: browser` per `bootstrap.md` §4. Never simulate rendered timing or visible jank from training-data priors.**
   - **If `shell` is unavailable, MUST NOT start the local dev server — fall back to a deployed sandbox URL when present in `_testatlas/00_overview.md` and mark findings `confidence: needs-validation` per `bootstrap.md` §4. If neither shell nor a sandbox URL is available, halt via stop condition.**
3. Verify safety flags. If the resolved target URL is a production host and `allowProductionTesting=false`, halt — never run perf traces against production. Inspect resolved URLs, not author-claimed environments.
4. (If `shell` is available) Start the local dev server per `_testatlas/00_overview.md` runtime metadata. Wait for the documented health-check (HTTP 200 on `/health` or equivalent). Persist the startup log under `_testatlas/evidence/explore-performance/<timestamp>/dev-server.log`.
5. Connect to Chrome DevTools MCP and confirm the canonical performance toolset is reachable. The required tools (verbatim names) are:
   - `navigate_page(url)` — load a target route under instrumentation.
   - `wait_for(condition)` — wait for the route to settle to a stable, comparable state.
   - `performance_start_trace(...)` — begin a trace capture before the user interaction.
   - `performance_stop_trace()` — end the trace and receive the trace JSON.
   - `performance_analyze_insight(...)` — derive insights (LCP, INP, CLS, long tasks, render-blocking, layout shifts) from a captured trace.
   - `emulate({cpuThrottlingRate, networkConditions})` — apply CPU and network throttling profiles for reliability runs.
   - `list_network_requests()` — capture XHR/fetch traffic with timing, status, retry counts, and payload size.
6. Select a representative route set: the home/landing route plus the 2–3 most-trafficked routes from `_testatlas/12_app_map.json` (or, absent traffic hints, the routes most central to the dogfood-loop's primary user flow). Record the rationale in `route-selection.md`.
7. For each selected route, capture a baseline trace: `navigate_page` → `wait_for` settle → `performance_start_trace` → exercise the primary user interaction (click, fill, submit) → `performance_stop_trace`. Persist the trace JSON under `_testatlas/evidence/explore-performance/<timestamp>/<route-slug>/baseline.trace.json`.
8. For each selected route, capture a throttled trace: call `emulate({cpuThrottlingRate: 4, networkConditions: 'Slow 3G'})` (or the equivalent profile name supported by the MCP build), repeat the baseline interaction sequence, and persist as `throttled.trace.json`. This is the reliability surface — slow CPUs and bad networks reveal the failures real users hit.
9. Run `performance_analyze_insight` against each captured trace. Persist insights (LCP, INP, CLS, total-blocking-time, long tasks, render-blocking resources, layout-shift sources) as `insights.md` per route, alongside the underlying machine-readable JSON when the tool returns one.
10. Capture the network inventory via `list_network_requests` for each trace, recording: URL, method, status, duration, payload size, and retry count. Persist as `network.json` per route. Highlight retried/failed requests, slow third-party calls, and unbatched requests.
11. Aggregate findings into `_testatlas/evidence/explore-performance/<timestamp>/findings.md` with severity per PRD §13.10 (critical / serious / moderate / minor), explicit threshold rationale (which budget the observed value violated), and confidence per `bootstrap.md` §8. Every finding cites at least one evidence path created in steps 7–10.
12. (If a dev server was started) Stop it cleanly. Record exit status in `dev-server.log`.
13. Close the lifecycle (next section).

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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
