---
description: Map every route, navigation paths, guards, redirects, deep-link behavior, history (back/forward), and per-route ownership via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable.
mode: primary
permission:
  edit:
    "_testatlas/**": allow
    ".testatlas/**": deny
    "*": ask
  bash: allow
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-routes.md" hash="cf938627fc4ff7f1953d7ed2d08ea9fc7b9678cfc09796f7fbdeb5fa141f7710" -->
First read `.testatlas/bootstrap.md`. Then read `.kilocode/workflows/atlas-explore-routes.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the full route surface: every URL the app responds to, the navigation paths between them (link, programmatic push, redirect chain), the route guards (auth, role, feature flag), deep-link behavior (entering the app at a non-root URL), and history-stack behavior (browser back / forward). Persist evidence under `_testatlas/evidence/explore-routes/<timestamp>/<route-slug>/`. Update `_testatlas/maps/routes.md` and `_testatlas/maps/routes.json`. Validate each route entry against `route.schema.json`. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` — Tier-1 toolset, component-discovery walkthrough.
- `_testatlas/12_app_map.json` — routes from `explore-codebase`.
- `_testatlas/maps/routes.json` — existing route catalog (this command updates it).
- `.testatlas/schemas/{route,evidence,app-map}.schema.json`.
- `.testatlas/default.config.json` — safety flags.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `browser` AND `MCP`. If unavailable, degrade to source reading: parse the framework router config (Next.js `app/`, React Router config, Vue Router, SvelteKit `+page.svelte`, etc.) referenced by `12_app_map.json`. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: <MCP|browser>`. Never invent route paths or guards.

3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available, this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Component-discovery walkthrough* (per-route navigation loop). Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the page contains, or because exhaustive coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the route lacks the surface, the tool errors after retry), record the skip rationale on the entry. MUST NOT skip silently.

4. **Tier-1 toolset (verbatim):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`.

5. **Per-route inspection.** For each route in `12_app_map.json`:
   - **Direct navigation (deep-link entry):** `navigate_page(routeUrl)` (i.e. enter the route directly, NOT via internal navigation). Capture HTTP status from `list_network_requests`, the rendered output via `take_snapshot` + `take_screenshot`. Verify the route renders the expected surface when the user enters cold; if it redirects, follow and record the redirect chain.
   - **Guarded routes:** strip session via `evaluate_script`, then `navigate_page(routeUrl)`. Observe redirect (302 → login | 401 | 403 | render). Log the guard's redirect target. Re-authenticate as required roles, repeat to map per-role visibility.
   - **Redirect chains:** if the route is a redirect, capture every hop's URL + status via `list_network_requests`. Record the chain length and final destination.
   - **Programmatic navigation:** `evaluate_script(() => history.pushState(null, "", "<routeUrl>"))` and observe whether the framework router catches the change (some SPAs require explicit router methods). Record the discrepancy if direct + programmatic produce different surfaces.
   - **History (back / forward) behavior:** from a known route, `navigate_page(otherRoute)` → `evaluate_script(() => history.back())` → text-based wait `wait_for({text: ["<expected-content-on-prior-route>"], timeout: 5000})` → poll `evaluate_script(() => document.readyState === 'complete' && !document.querySelector('[data-loading]'))` until truthy or 5 s elapsed → `take_snapshot`. Verify the prior route restores correctly (no stale state, scroll position OK, focus restoration). Symmetric `history.forward()`. (Do NOT use `wait_for(settle)` — that is not a supported API on `chrome-devtools-mcp`; only the text-based form `wait_for({text: [...], timeout?})` is canonical per `.testatlas/reference/chrome-devtools-mcp.md`.)

6. **Per-route metadata.** Record for each entry: `path`, `name`, `owning_domain` (cross-reference `_testatlas/domains/`), `methods`, `personas` (which personas reach this route), `purpose`, `entryPoints` (where this route is linked from), `actions` (interactive controls), `states[]` (cross-reference `_testatlas/maps/states.json`), `evidence[]`, `issues[]`, `confidence`.

7. **Coverage gap detection.** Compare enumerated routes against `12_app_map.json.routes[]`. Routes that exist in code but were never reachable at runtime → file findings (likely dead routes or guard misconfigurations) via `node .testatlas/scripts/create-issue.js`. Routes that exist at runtime but missing from `12_app_map.json` → flag as out-of-date map and re-run `/atlas:explore-codebase`.

8. **Persist + write.** Validate each route entry against `route.schema.json` before writing. Write `_testatlas/maps/routes.json` (atomic, AJV-validated) and regenerate `_testatlas/maps/routes.md`. The rich route shape (with guards, redirects, evidence, etc.) lives in `_testatlas/maps/routes.json`; `_testatlas/12_app_map.json.routes[]` is a closed string-array per `app-map.schema.json` (`additionalProperties:false`) — append only the route ID strings (e.g. `PAGE-<slug>` or path) to that array. If any cited evidence path fails to materialize on disk, halt.

9. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/routes.md` and `_testatlas/maps/routes.json` — full route catalog with guards, redirects, deep-link behavior, history-stack behavior, evidence refs.
- Updated `_testatlas/12_app_map.json.routes[]`.
- `_testatlas/evidence/explore-routes/<timestamp>/<route-slug>/` — `direct.png`, `direct.snapshot.json`, `network.json`, `redirect-chain.json`, `guard-401.png`, `guard-302-login.png`, `back.png`, `forward.png`, `console.log.txt`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, route count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{routes,evidence}`.
- `_testatlas/history/run_log.md` — narrative: "Mapped `<n>` routes / `<m>` redirects / `<k>` guarded paths in `_testatlas/evidence/explore-routes/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-routes --actor agent --summary "Mapped routing surfaces with redirects and guards" --status completed --reindex`.

## Stop Conditions

- Both `MCP` and `browser` unavailable AND no router source files in `12_app_map.json` → halt.
- `12_app_map.json` empty of routes → halt: "Run `/atlas:explore-codebase` first."
- Production target with `allowProductionTesting=false` → halt.
- `route.schema.json` validation fails → halt; do not commit a malformed map.
- Any captured artifact path fails to materialize on disk → halt.
- More than 5000 distinct routes detected at runtime → halt; surface as a stop condition (likely a parser false-positive in the router).

## Completion Criteria

- `_testatlas/maps/routes.json` lists every reachable route with deep-link behavior, guards, redirects, history-stack outcomes, and evidence refs.
- `maps/routes.md` regenerated and human-readable.
- `12_app_map.json.routes[]` reconciled (no out-of-date entries).
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:explore-components`** — inventory the components rendered on each route.
- **`/atlas:explore-state`** — map state lifecycles per route.
- **`/atlas:test-flow`** — drive end-to-end flows across the route graph.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
