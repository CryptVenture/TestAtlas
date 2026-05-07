---
description: Map UI states (empty, loading, error, success, permission) plus state transitions, default/initial states, and error recovery via mandatory Chrome DevTools MCP walkthrough; degrade to code-reading when MCP unavailable.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-state.md" hash="813516781f9b6bedfe9f4760f7b9d7cac9f2bbebbef92db7fdf4146374a7e7b6" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-explore-state.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map every interactive surface's state lifecycle: the PRD §13.1 5-state matrix (`empty`, `loading`, `error`, `success`, `permission`), each surface's default/initial state on entry, the transitions between states, and the error-recovery paths back to a working state. Persist evidence under `_testatlas/evidence/explore-state/<timestamp>/<route-slug>/<surface>/` and update `_testatlas/maps/states.md` + `_testatlas/maps/states.json`. Every claim MUST cite an on-disk evidence path.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/chrome-devtools-mcp.md` — canonical walkthrough patterns, tool tiering, the state-coverage walkthrough.
- `_testatlas/12_app_map.json` — routes, components, interactive surfaces.
- `_testatlas/maps/states.json` — existing state catalog (this command updates it).
- `.testatlas/schemas/{app-map,route,component,evidence}.schema.json` — output contracts.
- `.testatlas/default.config.json` — `safeMode`, `allowDestructiveActions`, `allowProductionTesting` flags.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim MUST cite an evidence file path under `_testatlas/evidence/explore-state/<timestamp>/`. Fabricated paths fail `validate-workspace`.

2. **Capability check.** This command needs `browser` AND `MCP`. If either is unavailable, MUST NOT produce runtime state findings — degrade to code reading via the source files referenced by `12_app_map.json`. Mark every degraded finding `confidence: needs-validation` and tag `tool_unavailable: <MCP|browser>` per `bootstrap.md` §4. Never invent screenshots, network captures, or DOM snapshots from training-data priors.

3. **Mandatory walkthrough when capabilities are available.** When `browser` AND `MCP` are both available, this command MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` § *State-coverage walkthrough*. Skipping a walkthrough step when the underlying tool is reachable — because the result feels predictable, because training-data priors tell the agent what the surface contains, or because exhaustive coverage feels excessive — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the surface lacks that state, the tool errors after retry), record the skip rationale on the resulting state entry. MUST NOT skip silently.

4. **Safety flags.** Refuse production hosts when `allowProductionTesting=false`. Refuse destructive controls when `allowDestructiveActions=false`.

5. **Tier-1 toolset (verbatim per `.testatlas/reference/chrome-devtools-mcp.md` §"Tool tiering"):** `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`. Pre-register `handle_dialog({accept, promptText?})` BEFORE any action that may open `alert` / `confirm` / `beforeunload`.

6. **State enumeration per surface.** For each interactive surface (form, modal, menu, list, search, filter, dialog) on each user-facing route:
   - **Default/initial state:** `navigate_page(url)` → `wait_for(settle)` → `take_snapshot` → `take_screenshot` → save under `evidence/explore-state/<ts>/<route>/<surface>/initial.{json,png}`. Record the surface's resting state on first entry.
   - **empty:** fresh load (no data) — `evaluate_script(() => localStorage.clear())` → reload → capture.
   - **loading:** induce via `emulate({networkConditions: 'Slow 3G'})` → `navigate_page` → screenshot BEFORE `wait_for` resolves. Restore `No throttling` after.
   - **error:** for forms — `fill_form(invalid)` + `click(submit)` + `wait_for("[role=alert]")`. For fetches — `evaluate_script(() => { window.fetch = () => Promise.reject(new Error("induced")); })` then trigger. Pre-register `handle_dialog({accept: false})` if the surface may open `alert` / `confirm`.
   - **success:** happy-path `fill_form(valid)` + `click(submit)` + `wait_for("[data-success], [role=status]")`.
   - **permission:** strip session via `evaluate_script(() => document.cookie='...; expires=Thu, 01 Jan 1970')` then `navigate_page`, OR sign in as a role lacking permission. Record observed status (302 → login | 401 | 403 | render).

7. **Transitions.** For each pair of observed states (initial→loading, loading→success, loading→error, error→success on retry, etc.) capture the trigger (event, click, route change, network event), the visual indicator that announces the transition, and the time-to-transition (use the timestamps on the screenshots). Record transitions as edges on the state entry.

8. **Error recovery paths.** From `error`, document the recovery action (retry button, reload, navigate-away, dismiss-and-edit). Drive each recovery path with the appropriate Tier-2 tool (`click`, `press_key`) and capture the resulting state. If a surface has no recovery path, record that as a finding (likely a UX gap).

9. **Persist + write.** Validate each state entry against `app-map.schema.json` / `evidence.schema.json` before writing. Update `_testatlas/maps/states.md` (human-readable catalog) and `_testatlas/maps/states.json` (machine-readable index, validates against the states-map schema fragment). Append affected route+component entries in `_testatlas/12_app_map.json`. If any cited evidence path does not exist on disk, halt — do not record fabricated paths.

10. Close the lifecycle.

## Outputs

- Updated `_testatlas/maps/states.md` and `_testatlas/maps/states.json` — state catalog with default state, observed states (5-state matrix), transitions, recovery paths, evidence refs.
- Updated `_testatlas/12_app_map.json` route + component entries — new `states[]` array entries.
- `_testatlas/evidence/explore-state/<timestamp>/<route-slug>/<surface>/` — `initial.{png,json}`, `empty.{png,json}`, `loading.{png,json}`, `error.{png,json}`, `success.{png,json}`, `permission.{png,json}`, `transitions.json`, `recovery.json`, `console.log.txt`, `network.json`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir path, surfaces / states / transitions counts.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative: "Mapped `<n>` surfaces / `<m>` states / `<t>` transitions in `_testatlas/evidence/explore-state/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-state --actor agent --status completed --reindex` so the brain reflects the new evidence and map updates.

## Stop Conditions

- Both `MCP` and `browser` unavailable → halt; this command requires ≥1 runtime observation surface.
- `_testatlas/12_app_map.json` has zero user-facing routes → halt: "Run `/atlas:explore-codebase` first."
- Production target with `allowProductionTesting=false` → halt; never override safety in-process.
- Destructive control detected with `allowDestructiveActions=false` → halt or skip the specific control with rationale.
- Any captured artifact path fails to materialize on disk → halt; do not record fabricated paths.
- Any map JSON fails schema validation → halt; do not commit a malformed map.

## Completion Criteria

- Every interactive surface in scope has an entry in `_testatlas/maps/states.json` with default state, observed states, transitions, recovery paths, and ≥1 evidence path on disk.
- 5-state matrix observed (or skip rationale recorded) for ≥1 surface per user-facing route.
- `maps/states.md` regenerated; `maps/states.json` validates against the states-map schema fragment.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## State Writer

For each distinct UI/process state surfaced during exploration, materialize a state record so the workspace carries a durable, machine-readable index of state coverage:

1. Choose a slug for the state (kebab-case, e.g. `cart-checkout`, `user-onboarding-step-2`).
2. Create directory `_testatlas/states/<slug>/`.
3. Write `_testatlas/states/<slug>/state.md` (human-readable narrative — preconditions, transitions, postconditions, recovery paths, evidence references).
4. Write `_testatlas/states/<slug>/state.json` (machine-readable record conforming to `.testatlas/schemas/state.schema.json` — name, slug, transitions[], persistence, recovery[]).
5. Validate via `node .testatlas/scripts/validate-workspace.js` to confirm `state.json` matches schema.

State coverage was previously aspirational — `_testatlas/states/` had a schema but no writer. PRD §13 mandates explore-state materializes the schema; this writer block closes that gap.

## What's Next

- **`/atlas:explore-errors`** — deepen the error path with boundaries, fallback UI, retry patterns.
- **`/atlas:test-flow`** — drive end-to-end scenarios that exercise the transitions you just captured.
- **`/atlas:explore-components`** — map the components that own these states.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
