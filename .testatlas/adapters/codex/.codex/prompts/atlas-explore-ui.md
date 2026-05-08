<!-- TestAtlas command: atlas-explore-ui. Invoke as /prompts:atlas-explore-ui. Description: Map routes, components, forms, modals, PRD §13.1 UI states (empty/loading/error/success/permission), responsive breakpoints, a11y basics via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-ui.md" hash="c09b2922ae8b2b663624df7713a0f6f3fbb39a84630ba38c7c9eca16dbccaae9" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-explore-ui.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map the target product's user-facing UI surface using Chrome DevTools MCP as the first-class observation layer, degrading to code reading when runtime capabilities are unavailable. Capture routes, components, forms, modals, every PRD §13.1 state (empty / loading / error / success / permission), responsive breakpoints, and accessibility basics. Update `_testatlas/12_app_map.json` and persist evidence under `_testatlas/evidence/explore-ui/<timestamp>/`. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` — canonical walkthrough patterns (component-discovery, state-coverage, interactive-surface), tool tiering (Tier 1 to 4), and the state-coverage matrix this command embeds; the mandatory-when-available contract lives there.
- `_testatlas/12_app_map.json` — existing routes / components from `explore-codebase`; the input the UI Explorer enriches.
- `.testatlas/schemas/{app-map,route,component,evidence}.schema.json` — output contracts.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.
- Target repo UI source files referenced by `12_app_map.json` — fallback observation surface when runtime tools are unavailable.

## Sub-Agent Task Brief Contract

Runs as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. Sub-agent invocations receive a brief matching the contract below; standalone invocations fill it from these defaults.

- **objective:** Map UI surface (routes, components, forms, modals, all PRD §13.1 states, responsive breakpoints, ARIA basics).
- **scope:** Every route in `12_app_map.json` whose handler resolves to a user-facing UI surface; excludes API-only routes, headless services, CLI binaries.
- **files-to-read:** `_testatlas/12_app_map.json`; `.testatlas/schemas/{app-map,route,component,evidence}.schema.json`; `.testatlas/default.config.json` (safety flags); UI source files referenced by app-map.
- **output-format:** Updated route + component entries in `12_app_map.json`; raw evidence under `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/`.
- **may-write:** Sub-agent invocations defer to the umbrella brief (default: no direct `_testatlas/` writes — umbrella aggregates). Standalone MAY write the artifacts under `## Outputs`.
- **exit-criteria:** Every entry cites on-disk evidence; PRD §13.1 states observed (or skip rationale recorded); ≥3 responsive breakpoints captured per route; schema validation passes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.

2. Verify capabilities. `MCP` and `browser` are the runtime observation surfaces. **If either `MCP` or `browser` is unavailable, MUST NOT produce runtime UI findings — degrade to code reading via `12_app_map.json` and the source files it references. Mark every finding `confidence: needs-validation` and add `tool_unavailable: <MCP|browser>` per `bootstrap.md` §4. Never invent screenshots, network captures, console output, traces, or a11y scores from training-data priors.** When BOTH are unavailable, halt via the stop condition below — `explore-codebase` covers code-only mapping.

3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available in this adapter context (verified per `.testatlas/reference/capabilities.md` per-capability action matrix), this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Component-discovery walkthrough* and § *State-coverage walkthrough*. Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the page contains, or because coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the surface does not exist on this route, the tool returns an error after retry), record the skip rationale on the resulting artifact entry. MUST NOT skip silently.

4. Verify safety flags. If `allowProductionTesting=false`, refuse hosts whose resolved URL maps to production (prod hostnames, live API keys, real payment processors); inspect resolved URLs, not scenario-author claims. If `allowDestructiveActions=false`, refuse UI controls whose label or handler indicates irreversible mutation (delete confirmation, payment capture, account closure).

5. Connect to Chrome DevTools MCP. Canonical toolset (verbatim names per `.testatlas/reference/chrome-devtools-mcp.md` §"Tool tiering"):
   - **Tier 1 — observation:** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Register `handle_dialog({action: "accept", promptText?})` (or `{action: "dismiss"}`) BEFORE any action that may open `alert` / `confirm` / `beforeunload`; without pre-registration, dialog flows hang or silently fabricate. The Chrome DevTools MCP `handle_dialog` accepts `{action: "accept"|"dismiss", promptText?}` — there is no boolean `accept` parameter (see `.testatlas/reference/chrome-devtools-mcp.md` for the canonical surface).
   - **Tier 2 — interactive:** `click`, `fill`, `fill_form`, `press_key`, `hover`, `type_text`, `upload_file`, `drag`. `hover` reveals tooltip / dropdown / hover-only state. `type_text` (real keyboard typing) surfaces autocomplete + IME bugs that `fill` skips. `press_key` for keyboard paths (`Tab` / `Shift+Tab` / `Enter` / `Escape`) — required for tab-trap and focus-cycle verification. `upload_file` covers file flows; `drag` covers drag-and-drop / kanban / file drop.
   - **Aux:** `lighthouse_audit({mode: "navigation"})` for an optional baseline (read the `.accessibility` slice; deep a11y audits live in `explore-accessibility`); `resize_page({width, height})` for responsive breakpoints. The upstream `lighthouse_audit` has no `categories` parameter — it always returns Accessibility/SEO/Best-Practices/Agentic-browsing (Performance lives in `performance_start_trace`).

6. For each user-facing route in `_testatlas/12_app_map.json`, run `navigate_page` → `wait_for` → `take_snapshot` → `take_screenshot` → `list_console_messages` + `list_network_requests`. Persist every artifact under `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/` BEFORE adding a route or component entry that cites it.

7. For each interactive surface (forms, modals, menus, dialogs), exercise the PRD §13.1 5-state matrix per `.testatlas/reference/chrome-devtools-mcp.md` § *State-coverage walkthrough*. The five states with their trigger techniques (verbatim):
   - **empty** — `navigate_page` as a fresh user, or `evaluate_script(() => localStorage.clear())` then reload.
   - **loading** — `emulate({networkConditions: 'Slow 3G'})` then `navigate_page`; `take_screenshot` BEFORE `wait_for` resolves.
   - **error** — forms: `fill_form` invalid payload + `click(submit)` + `wait_for({text: ["<expected error text from the rendered alert>"]})`; fetches: `evaluate_script(() => { window.fetch = () => Promise.reject(new Error("induced")); })` then refetch. Pre-register `handle_dialog({action: "dismiss"})` if the surface may open `alert` / `confirm`. (`wait_for` is text-based per upstream `chrome-devtools-mcp`; for selector-presence polling use `evaluate_script(() => !!document.querySelector("[role=alert]"))` after `take_snapshot`.)
   - **success** — happy path `fill_form` (valid) + `click(submit)` + `wait_for({text: ["<expected success text>"]})` (or `evaluate_script` poll for `[data-success]` / `[role=status]`).
   - **permission** — strip session cookie via `evaluate_script` then `navigate_page`, OR sign in as a role lacking permission; record observed status (302 → login | 401 | 403 | render).

   Skip a state only when the surface legitimately lacks it (e.g., a static page has no submit); record the rationale on the component entry. Silent skip is a contract violation per Required Action 3.

8. Responsive: call `resize_page` at ≥3 breakpoints — mobile (~375), tablet (~768), desktop (~1280) — and screenshot each into `_testatlas/evidence/explore-ui/<ts>/<route-slug>/responsive/`.

9. A11y basics: call `evaluate_script` to read ARIA roles, labels, focus order, and visible-text-vs-accessible-name diffs. Defer keyboard traversal, contrast, and full WCAG checks to `explore-accessibility`. Optionally call `lighthouse_audit` for a baseline score.

10. Write rich route + component shape (discovered states, breakpoints, evidence paths) to `_testatlas/maps/routes.json` and `_testatlas/maps/components.json` (atomic, AJV-validated against `route.schema.json` and `component.schema.json` respectively). Append only the route/component **ID strings** to `_testatlas/12_app_map.json.routes[]` and `_testatlas/12_app_map.json.components[]` — those top-level keys are closed string arrays per `app-map.schema.json` (`additionalProperties:false`). State enrichment per surface goes to the top-level `states` array on `12_app_map.json` (which IS schema-allowed). Validate the resulting `12_app_map.json` against `app-map.schema.json` before writing. If any cited evidence path does not exist on disk, halt — do not record fabricated paths.

11. Close the lifecycle.

## Outputs

- Updated `_testatlas/12_app_map.json` — route + component **ID strings** appended to the schema-allowed `routes[]` and `components[]` arrays; per-surface state findings appended to the top-level `states[]` array. Rich shape (breakpoints, ARIA snapshots, evidence refs) lives in `_testatlas/maps/routes.json` and `_testatlas/maps/components.json`.
- `_testatlas/evidence/explore-ui/<timestamp>/<route-slug>/` — DOM snapshots, screenshots, console + network captures, optional Lighthouse JSON; `responsive/` subdir for breakpoint screenshots.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record completion state, evidence-directory path, route / component / state counts.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{routes,components,evidence}`.
- `_testatlas/history/run_log.md` — narrative: "Mapped `<n>` routes / `<n>` components / `<n>` breakpoints / `<n>` evidence files in `_testatlas/evidence/explore-ui/<ts>/`."

## Stop Conditions

- `_testatlas/12_app_map.json` empty of UI routes → halt: "Run `/atlas:explore-codebase` first." Do not invent routes.
- Both `MCP` and `browser` unavailable → halt; this command requires ≥1 runtime observation surface (code-only mapping is `explore-codebase`).
- Production target with `allowProductionTesting=false` → halt; never override safety in-process.
- Destructive UI flow detected with `allowDestructiveActions=false` → halt or skip the specific control with rationale.
- Any captured artifact path fails to materialize on disk → halt; do not record fabricated paths.
- `app-map`, `route`, or `component` schema validation fails → halt; do not commit a malformed map.

## Completion Criteria

- Every recorded route + component cites ≥1 on-disk evidence path under `_testatlas/evidence/explore-ui/<timestamp>/`.
- The five PRD §13.1 UI states (empty / loading / error / success / permission) observed for ≥1 user-facing route, OR missing states marked not-applicable on the component.
- ≥3 responsive breakpoints captured per user-facing route.
- Manifest counts match disk; the five lifecycle files updated; zero stop conditions triggered.

## What's Next

- **`/atlas:explore-accessibility`** — audit mapped routes for WCAG.
- **`/atlas:test-flow`** — execute end-to-end scenarios against mapped routes.
- **`/atlas:plan`** — turn the route+component map into a test plan.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
