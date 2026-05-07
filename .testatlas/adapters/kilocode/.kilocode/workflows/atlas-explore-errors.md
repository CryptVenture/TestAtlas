---
description: Map error boundaries, fallback UI, error logging, retry patterns, and exception flows via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable.
mode: primary
permission:
  edit:
    "_testatlas/**": allow
    ".testatlas/**": deny
    "*": ask
  bash: allow
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-errors.md" hash="2e877101fcb41aaa335327e1a59a592aeacd75288f372021e120b984a39055be" -->
First read `.testatlas/bootstrap.md`. Then read `.kilocode/workflows/atlas-explore-errors.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the target product's error-handling surface: error boundaries (component-tree-level), fallback UIs (what the user sees when a child crashes or a fetch fails), error logging targets (console, telemetry sink, server log), retry patterns (manual retry button, exponential backoff, timeout fallback), and exception propagation (caught vs uncaught). Persist evidence under `_testatlas/evidence/explore-errors/<timestamp>/<route-slug>/`. Update `_testatlas/maps/states.json` (the `error` state row) and append findings to `_testatlas/12_app_map.json` route+component entries. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` — Tier-1 toolset, Tier-2 interactive, walkthrough patterns.
- `_testatlas/12_app_map.json` — routes / components in scope.
- `_testatlas/maps/states.json` — existing error-state catalog.
- `.testatlas/schemas/{evidence,issue}.schema.json`.
- `.testatlas/default.config.json` — safety flags.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `browser` AND `MCP`. If unavailable, degrade to code reading: grep for `try`/`catch`, `componentDidCatch`, `ErrorBoundary`, `error.tsx`, `onError`, `Sentry`, `console.error`, `window.onerror`, `unhandledrejection` handlers. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: <MCP|browser>`. Never invent stack traces or telemetry payloads.

3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available, this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *State-coverage walkthrough* (error branch) and § *Interactive-surface walkthrough*. Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the page contains, or because exhaustive coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the surface lacks an error path, the tool errors after retry), record the skip rationale on the entry. MUST NOT skip silently.

4. **Tier-1 toolset (verbatim):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Pre-register `handle_dialog({accept: false})` BEFORE any flow that may surface a confirm/alert.

5. **Error-injection sweep.** For each user-facing route + each interactive surface:
   - **Network failure:** `evaluate_script(() => { const o = window.fetch; window.fetch = () => Promise.reject(new Error("induced-network")); })` → trigger surface → `wait_for(error indicator)` → `take_screenshot` + `list_console_messages` + `list_network_requests`.
   - **HTTP 5xx:** `evaluate_script` to wrap fetch and resolve with `new Response("", {status: 500})` → trigger → capture.
   - **Timeout:** `emulate({networkConditions: 'Slow 3G'})` → trigger → wait past expected timeout → capture (does the UI show a timeout fallback?).
   - **Form invalid input:** `fill_form(invalid)` + `click(submit)` + `wait_for("[role=alert], .error")` → capture inline error messages, accessibility (role=alert), and field highlighting.
   - **Component crash:** `evaluate_script(() => { throw new Error("induced-component"); })` from a known event handler entry point if the surface allows. Observe the error boundary's fallback UI; if the whole route crashes (white screen), record as a critical issue.
   - **Permission error:** strip session, refetch protected resource → capture 401/403 fallback.

6. **Logging audit.** After each injection, capture `list_console_messages` and `list_network_requests` to detect:
   - Does `console.error` fire? Is the message human-readable or a stack-trace dump?
   - Are errors POSTed to a telemetry sink (Sentry, Rollbar, custom `/api/log`)? Capture the request payload.
   - Are PII / secrets leaked into log lines? Run `node scripts/redact-evidence.js <evidence-path>` on each captured log file.

7. **Retry-pattern catalog.** For each error captured, document the recovery primitive:
   - Manual retry button (label + selector).
   - Auto-retry (count + backoff timing).
   - Page reload prompt (modal / banner).
   - Silent fallback (cached data displayed with stale indicator).
   - None (the user is stuck — file as an issue via `node scripts/create-issue.js` per `.testatlas/commands/log-issue.md`).

8. **Persist + write.** Validate findings against `evidence.schema.json` before writing. Update `_testatlas/maps/states.json` `error` rows. Append to `_testatlas/12_app_map.json` route+component `errorBoundaries`, `errorLogging`, `retryPatterns` fields. If any cited evidence path does not exist on disk, halt.

9. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/states.json` (error rows).
- Updated `_testatlas/12_app_map.json` (route + component error metadata).
- `_testatlas/evidence/explore-errors/<timestamp>/<route-slug>/<surface>/` — `network.png`, `http-5xx.png`, `timeout.png`, `invalid-form.png`, `component-crash.png`, `permission.png`, `console.log.txt`, `network.json`, `retry.json`.
- New issues filed via `create-issue.js` for unrecovered errors.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, error-injection counts.
- `_testatlas/09_artifact_index.md` — re-derive on-disk list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{evidence,issues}`.
- `_testatlas/history/run_log.md` — narrative: "Probed `<n>` error paths across `<m>` surfaces; filed `<k>` issues; evidence at `_testatlas/evidence/explore-errors/<ts>/`."

Then run `node scripts/update-brain-after-command.js --command explore-errors --actor agent --status completed --reindex`.

## Stop Conditions

- Both `MCP` and `browser` unavailable → halt; degraded code-only audit will not exercise actual error paths.
- Production target with `allowProductionTesting=false` → halt.
- An injected error fires a destructive side effect (payment, deletion) and `allowDestructiveActions=false` → halt; restore page state via reload before any further injection.
- Any cited evidence path fails to materialize on disk → halt; do not record fabricated paths.

## Completion Criteria

- Every user-facing route + interactive surface in scope has at least one entry recording the error-handling characteristics (boundary, fallback, logging, retry).
- Every captured `console.error` / telemetry POST checked for PII via `redact-evidence.js`.
- New issues filed for surfaces without recovery paths.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:explore-state`** — confirm the error rows on the state catalog align.
- **`/atlas:explore-observability`** — verify the logging targets you just discovered actually receive the events.
- **`/atlas:triage`** — prioritize the issues this command filed.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
