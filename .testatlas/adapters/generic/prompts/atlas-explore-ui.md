<!-- TestAtlas command: atlas-explore-ui. Paste .testatlas/bootstrap.md first; description: Map routes, components, forms, modals, all PRD §13.1 UI states (empty/loading/error/success/permission), responsive breakpoints, and accessibility basics using Chrome DevTools MCP — degrade to code reading when MCP unavailable. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-ui.md" hash="3153ff7a967734c1e34ca2d52a5cdf325bfdc22f855873bdf7969a9a706977c4" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the target product's user-facing UI surface using Chrome DevTools MCP as the first-class observation layer with a graceful fallback to code reading when runtime capabilities are unavailable. Capture routes, components, forms, modals, every required UI state per PRD §13.1 (empty / loading / error / success / permission), responsive breakpoints, and accessibility basics. Update `_testatlas/12_app_map.json` route + component entries and persist evidence under `_testatlas/evidence/explore-ui/<timestamp>/`. Every claim MUST cite an evidence file path that exists on disk.

→ See: `prd/prd.md` §13.1 for the full UI Explorer must-discover set. This command does not re-enumerate it.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/12_app_map.json` — existing routes and components produced by `explore-codebase`; the input the UI Explorer enriches.
- `.testatlas/schemas/app-map.schema.json`, `route.schema.json`, `component.schema.json`, `evidence.schema.json` — output contracts this command must satisfy before writing.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- The target repository's UI source files referenced by `12_app_map.json` (page components, route handlers, form definitions). These are the fallback observation surface when runtime tools are unavailable.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Map the UI surface (routes, components, forms, modals, all PRD §13.1 states — empty/loading/error/success/permission, responsive breakpoints, ARIA basics) of the target product.
- **scope:** Every route in `12_app_map.json` whose handler resolves to a user-facing UI surface; excludes API-only routes, headless services, and CLI binaries.
- **files-to-read:** `_testatlas/12_app_map.json`; `.testatlas/schemas/app-map.schema.json`, `route.schema.json`, `component.schema.json`, `evidence.schema.json`; `.testatlas/default.config.json` (safety flags); UI source files referenced by app-map (page components, route handlers, form definitions).
- **output-format:** Updated route + component entries in `12_app_map.json`; raw evidence (DOM snapshots, screenshots, console + network captures, responsive breakpoint screenshots) under `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** Every route + component entry cites on-disk evidence; PRD §13.1 states observed (or skip rationale recorded); ≥3 responsive breakpoints captured per user-facing route; schema validation passes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.

2. Verify capabilities. `MCP` and `browser` are the runtime observation surfaces. **If either `MCP` or `browser` is unavailable, MUST NOT produce runtime UI findings — fall back to code reading via `app-map` (`12_app_map.json`) and the source files it references. Mark every finding `confidence: needs-validation` and add `tool_unavailable: <MCP|browser>` per `bootstrap.md` §4. Never invent screenshots, network captures, console output, traces, or accessibility scores from training-data priors.** When BOTH `MCP` and `browser` are unavailable, halt via the stop condition below — `explore-codebase` already covers code-only mapping.

3. Verify safety flags. If `allowProductionTesting=false`, refuse to navigate to any host whose resolved URL maps to production (production hostnames, live API keys, real payment processors). Inspect resolved URLs rather than scenario-author claims. If `allowDestructiveActions=false`, refuse to exercise any UI control whose label or handler indicates an irreversible mutation (delete confirmation, payment capture, account closure).

4. Connect to the Chrome DevTools MCP server. The canonical toolset (verbatim names per the Chrome DevTools MCP `tool-reference.md`):
   - `navigate_page(url)` — open the route under test.
   - `wait_for(condition)` — block on selector / text / network-idle before capture.
   - `take_snapshot()` — DOM structure (primary observation surface for accessibility tree + ARIA).
   - `take_screenshot(format, fullPage)` — visual evidence under `_testatlas/evidence/explore-ui/<ts>/<route-slug>/`.
   - `click(selector)`, `fill(selector, value)`, `fill_form(...)` — exercise interactive states.
   - `evaluate_script(js)` — read computed styles, focus state, ARIA roles / labels, contrast hints.
   - `list_console_messages()` — capture JS errors and warnings.
   - `list_network_requests()` — capture XHR / fetch / WebSocket traffic.
   - `lighthouse_audit(...)` — optional baseline a11y / perf score (deep audits live in `explore-accessibility` and `explore-performance`).
   - `resize_page({width, height})` — exercise responsive breakpoints.

5. For each route in `_testatlas/12_app_map.json` whose handler resolves to a user-facing UI surface, navigate via `navigate_page`, wait via `wait_for`, snapshot the DOM via `take_snapshot`, take a screenshot via `take_screenshot`, and capture both `list_console_messages` and `list_network_requests`. Persist every artifact under `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/` BEFORE adding a route or component entry that cites it.

6. For each interactive surface (forms, modals, menus, dialogs), exercise the canonical PRD §13.1 UI states using `click`, `fill`, and `fill_form`: capture **empty** (initial), **loading** (in-flight submit), **error** (invalid input or server rejection), **success** (happy path), and **permission** (unauthorized / forbidden). Skip a state only when the surface legitimately lacks it (e.g., a static marketing page has no submit), and record the skip rationale on the component entry.

7. For responsive coverage, call `resize_page` for at least three breakpoints — mobile (~375 wide), tablet (~768 wide), desktop (~1280 wide) — and capture a screenshot at each. Save under `_testatlas/evidence/explore-ui/<ts>/<route-slug>/responsive/`.

8. For accessibility basics, call `evaluate_script` to read ARIA roles, labels, focus order, and visible-text-vs-accessible-name diffs. Defer deep accessibility coverage (keyboard traversal, contrast ratios, full WCAG checks) to `explore-accessibility`. Optionally call `lighthouse_audit` for a baseline a11y score.

9. Update `_testatlas/12_app_map.json` route and component entries with the discovered states, breakpoints observed, and evidence paths. Validate the resulting JSON against `app-map.schema.json`, `route.schema.json`, and `component.schema.json` before writing. If any evidence path referenced does not exist on disk, halt — do not record fabricated paths.

10. Close the lifecycle (next section).

## Outputs

- Updated `_testatlas/12_app_map.json` route + component entries with state coverage, breakpoint observations, ARIA snapshots, and evidence references.
- `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/` — DOM snapshots, screenshots, console-message dumps, network-request captures, optional Lighthouse JSON.
- `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/responsive/` — breakpoint screenshots (mobile / tablet / desktop).

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the command + completion state, evidence-directory path, and counts of routes / components / states observed.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new evidence directory and updated `12_app_map.json` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.routes`, `counts.components`, `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` routes / `<n>` components across `<n>` breakpoints with `<n>` evidence files in `_testatlas/evidence/explore-ui/<ts>/`."

## Stop Conditions

- `_testatlas/12_app_map.json` empty of UI routes → halt with: "Run `/atlas:explore-codebase` first — UI Explorer requires a route inventory." Do not invent routes.
- Both `MCP` and `browser` capabilities unavailable → halt; this command requires at least one runtime observation surface. Code-only UI mapping is `explore-codebase`'s contract.
- Production target detected with `allowProductionTesting=false` → halt; never override safety in-process.
- Destructive UI flow detected (delete confirmation, payment capture, irreversible mutation) and `allowDestructiveActions=false` → halt or skip the specific control with rationale.
- Any captured screenshot / DOM snapshot / network log path fails to materialize on disk after capture → halt; do not record fabricated paths.
- `app-map.schema.json`, `route.schema.json`, or `component.schema.json` validation fails on the produced JSON → halt; do not commit a malformed map.

## Completion Criteria

- Every recorded route + component entry cites at least one evidence path that exists on disk under `_testatlas/evidence/explore-ui/<timestamp>/`.
- The five PRD §13.1 UI states (empty / loading / error / success / permission) are observed for at least one user-facing route, OR each missing state is documented as not-applicable on the relevant component entry.
- At least three responsive breakpoints captured per user-facing route.
- Manifest counts updated to match disk.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the UI surface is mapped:

- **`/atlas:explore-accessibility`** — audit the mapped routes for WCAG conformance
- **`/atlas:test-flow`** — execute end-to-end scenarios against the mapped routes
- **`/atlas:plan`** — turn the route+component map into a test plan
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
