---
command: explore-errors
version: 2.0.0
description: Map error boundaries, fallback UI, error logging, retry patterns, and exception flows via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable.
capabilities: [shell, browser, MCP, file-write]
produces:
  - command-result
  - evidence
consumes:
  - app-map
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT crash production. Does NOT fabricate console traces or network captures when MCP/browser unavailable — degrade per bootstrap §4.
---

# TestAtlas Command (V2): explore-errors

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/11_workspace_manifest.json` if present.
4. Inspect `_testatlas/12_app_map.json` and existing error reports.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Map the target product's error-handling surface: error boundaries (component-tree-level), fallback UIs (what the user sees when a child crashes or a fetch fails), error logging targets (console, telemetry sink, server log), retry patterns (manual retry button, exponential backoff, timeout fallback), and exception propagation (caught vs uncaught). Persist evidence under `_testatlas/evidence/explore-errors/<timestamp>/<route-slug>/`. Update `_testatlas/maps/states.json` (the `error` state row) and append findings to `_testatlas/12_app_map.json` under the top-level `errorHandling` array (per `app-map.schema.json`). Every claim MUST cite an on-disk evidence path.

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

4. **Tier-1 toolset (verbatim):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Pre-register `handle_dialog({action: "dismiss"})` BEFORE any flow that may surface a confirm/alert.

5. **Error-injection sweep.** For each user-facing route + each interactive surface:
   - **Network failure:** `evaluate_script(() => { const o = window.fetch; window.fetch = () => Promise.reject(new Error("induced-network")); })` → trigger surface → `wait_for(error indicator)` → `take_screenshot` + `list_console_messages` + `list_network_requests`.
   - **HTTP 5xx:** `evaluate_script` to wrap fetch and resolve with `new Response("", {status: 500})` → trigger → capture.
   - **Timeout:** `emulate({networkConditions: 'Slow 3G'})` → trigger → wait past expected timeout → capture (does the UI show a timeout fallback?).
   - **Form invalid input:** `fill_form(invalid)` + `click(submit)` + `wait_for({text: ["<expected error text from the rendered alert>"]})` → capture inline error messages, accessibility (role=alert), and field highlighting. (`wait_for` is text-based per upstream `chrome-devtools-mcp`; for selector-presence polling use `evaluate_script(() => !!document.querySelector("[role=alert], .error"))`.)
   - **Component crash:** `evaluate_script(() => { throw new Error("induced-component"); })` from a known event handler entry point if the surface allows. Observe the error boundary's fallback UI; if the whole route crashes (white screen), record as a critical issue.
   - **Permission error:** strip session, refetch protected resource → capture 401/403 fallback.

6. **Logging audit.** After each injection, capture `list_console_messages` and `list_network_requests` to detect:
   - Does `console.error` fire? Is the message human-readable or a stack-trace dump?
   - Are errors POSTed to a telemetry sink (Sentry, Rollbar, custom `/api/log`)? Capture the request payload.
   - Are PII / secrets leaked into log lines? For each emitted EVIDENCE-* record from this run, run `node .testatlas/scripts/redact-evidence.js --evidence-id <EVIDENCE-XXX>` (the script's only supported arg shape — no `--scan`, no positional path; one redact pass per evidence id).

7. **Retry-pattern catalog.** For each error captured, document the recovery primitive:
   - Manual retry button (label + selector).
   - Auto-retry (count + backoff timing).
   - Page reload prompt (modal / banner).
   - Silent fallback (cached data displayed with stale indicator).
   - None (the user is stuck — file as an issue via `node .testatlas/scripts/create-issue.js` or `/atlas:log-issue`).

8. **Persist + write.** Validate findings against `evidence.schema.json` before writing. Update `_testatlas/maps/states.json` `error` rows. Append to `_testatlas/12_app_map.json` under the top-level `errorHandling` array (per `app-map.schema.json`). Each entry:
   - `surface` (string, required) — route / component / api / CLI surface.
   - `kind` (string, required, enum: `boundary` | `logging` | `retry` | `fallback` | `timeout`).
   - `evidence` (string, optional) — evidence record id.
   - `notes` (string, optional).

   Example entry:
   ```json
   {
     "surface": "POST /api/checkout",
     "kind": "retry",
     "evidence": "EVIDENCE-042-checkout-retry",
     "notes": "Backoff up to 3 attempts on 5xx"
   }
   ```

   DO NOT write any per-feature ad-hoc keys (e.g. boundary-only arrays, logging-only arrays, retry-only arrays) — every error-handling fact collapses into a single `errorHandling[]` entry whose `kind` field carries the variant. The `app-map.schema.json` is closed under `additionalProperties:false`; ad-hoc top-level keys fail validation.

   If any cited evidence path does not exist on disk, halt.

9. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/states.json` (error rows).
- Updated `_testatlas/12_app_map.json` top-level `errorHandling` array (schema-aligned per `app-map.schema.json`; entries closed under `additionalProperties: false`).
- `_testatlas/evidence/explore-errors/<timestamp>/<route-slug>/<surface>/` — `network.png`, `http-5xx.png`, `timeout.png`, `invalid-form.png`, `component-crash.png`, `permission.png`, `console.log.txt`, `network.json`, `retry.json`.
- New issues filed via `create-issue.js` for unrecovered errors.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, error-injection counts.
- `_testatlas/09_artifact_index.md` — re-derive on-disk list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{evidence,issues}`.
- `_testatlas/history/run_log.md` — narrative: "Probed `<n>` error paths across `<m>` surfaces; filed `<k>` issues; evidence at `_testatlas/evidence/explore-errors/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-errors --actor agent --summary "Probed error paths and filed issues across surfaces" --status completed --reindex`.

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
