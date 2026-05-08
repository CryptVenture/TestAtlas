<!-- TestAtlas command: atlas-explore-components. Invoke as /prompts:atlas-explore-components. Description: Inventory every UI component with props, state dependencies, responsive behavior, accessibility basics, and observed routes via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-components.md" hash="f55ecfde7fae096559890f102daa81ee5c1faf0de895131f6d2c06252422ea5f" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-explore-components.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Build a complete component inventory with props, state dependencies (what state(s) drive the component's rendering), responsive behavior at ≥3 breakpoints, accessibility basics (role, label, focus order), the routes the component is used on, and observed behavior on render. Persist evidence under `_testatlas/evidence/explore-components/<timestamp>/<route-slug>/<component-name>/`. Update `_testatlas/maps/components.md` and `_testatlas/maps/components.json`. Append `components[]` entries on `_testatlas/12_app_map.json`. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` — Tier-1 toolset, component-discovery walkthrough.
- `_testatlas/12_app_map.json` — routes producing components.
- `_testatlas/maps/components.json` — existing component catalog (this command updates it).
- `.testatlas/schemas/{component,evidence,app-map}.schema.json`.
- `.testatlas/default.config.json` — safety flags.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `browser` AND `MCP`. If unavailable, degrade to source reading: parse `.tsx`, `.vue`, `.svelte`, `.jsx` files referenced by `12_app_map.json` to enumerate exported components, props (TypeScript interfaces / PropTypes), and importing routes. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: <MCP|browser>`. Never invent component names, props, or rendered states.

3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available, this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *Component-discovery walkthrough*. Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the page contains, or because exhaustive coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the component is conditionally rendered and not observable on the visited route), record the skip rationale on the entry. MUST NOT skip silently.

4. **Tier-1 toolset (verbatim per `.testatlas/reference/chrome-devtools-mcp.md`):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Pre-register `handle_dialog` BEFORE any flow that may open a confirm dialog.

5. **Per-route component discovery loop.** For each user-facing route in `12_app_map.json`:
   - `navigate_page(url)` → `wait_for({text: ["<expected text from the rendered route header / hero / known-content marker>"], timeout: 5000})`. (`wait_for` is text-based per upstream `chrome-devtools-mcp`; for selector-presence polling use `evaluate_script(() => !!document.querySelector("[data-route-ready], main, #root"))` after `take_snapshot`.)
   - `take_snapshot()` (accessibility tree) → save under `evidence/<route>/snapshot.json`.
   - `take_screenshot({fullPage: true})` → `evidence/<route>/initial.png`.
   - `evaluate_script` to enumerate components: walk DOM for `[data-testid]`, `[data-component]`, `[role]`, named React/Vue/Svelte component classes (when the framework dehydrates that into the DOM via `data-react-component` etc.). Capture `{ tag, role, testid, classList, accessibleName }`.
   - For each enumerated component, capture its **props** signature: read from React DevTools shim (`__REACT_DEVTOOLS_GLOBAL_HOOK__`) when available, OR from `data-*` attributes the framework emits, OR fall back to `attributes` on the DOM element with a warning that DOM attributes are a subset of props.
   - Capture **state dependencies**: re-render the same component under each of the 5 PRD §13.1 states (drive via `explore-state` walkthrough's induction techniques) and record which states cause visible diffs in the component's snapshot.
   - Capture **responsive behavior**: `resize_page({width, height})` at `{375, 768, 1280}` → `take_screenshot` per breakpoint into `evidence/<route>/<component>/responsive/<bp>.png`.
   - Capture **accessibility basics**: from the snapshot, record `role`, `accessibleName`, `accessibleDescription`, focus-order index. Defer keyboard traversal + contrast to `/atlas:explore-accessibility`.

6. **Cross-route aggregation.** A component appearing on multiple routes gets a single entry in `_testatlas/maps/components.json` with `usedOnPages[]` listing every observed route. Validate that each `usedOnPages` entry exists in `12_app_map.json` routes.

7. **Persist + write.** Validate each component entry against `component.schema.json` before writing. Write `_testatlas/maps/components.json` (atomic, AJV-validated) and regenerate `_testatlas/maps/components.md`. Append component IDs into `_testatlas/12_app_map.json.components[]`. If any cited evidence path is missing on disk, halt.

8. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/components.md` and `_testatlas/maps/components.json` — full component inventory with props, state dependencies, responsive screenshots, a11y basics, evidence refs.
- Updated `_testatlas/12_app_map.json.components[]`.
- `_testatlas/evidence/explore-components/<timestamp>/<route-slug>/<component-name>/` — `snapshot.json`, `initial.png`, `props.json`, `responsive/{375,768,1280}.png`, `console.log.txt`, `network.json`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, component count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.{components,evidence}`.
- `_testatlas/history/run_log.md` — narrative: "Inventoried `<n>` components across `<m>` routes / `<k>` breakpoints in `_testatlas/evidence/explore-components/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-components --actor agent --status completed --reindex`.

## Stop Conditions

- Both `MCP` and `browser` unavailable AND no source files referenced by `12_app_map.json` → halt.
- `12_app_map.json` empty of UI routes → halt: "Run `/atlas:explore-codebase` first."
- Production target with `allowProductionTesting=false` → halt.
- `component.schema.json` validation fails on the produced JSON → halt; do not commit a malformed map.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- `_testatlas/maps/components.json` lists every observed component with props, state dependencies, ≥3 responsive breakpoints, a11y basics, evidence refs.
- `maps/components.md` regenerated and human-readable.
- `12_app_map.json.components[]` updated; cross-references with `usedOnPages` resolve.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:explore-state`** — drive the state matrix for each component's interactive surfaces.
- **`/atlas:explore-accessibility`** — deep WCAG audit for the components you just inventoried.
- **`/atlas:test-flow`** — compose flows that touch the components mapped here.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
