<!-- TestAtlas command: atlas-test-accessibility. Invoke as /atlas-test-accessibility. Description: Execute accessibility-typed scenarios using Chrome DevTools MCP lighthouse_audit + ARIA introspection; assert against PRD §13.9 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario a11y findings. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test-accessibility.md" hash="1ec07e38b614fba2" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Execute scenarios with `type === "accessibility"` from `_testatlas/tests/matrix.json` per PRD §26.7 — a Chrome DevTools MCP-driven audit that asserts each scenario against PRD §13.9 thresholds (lighthouse accessibility category score, presence/absence of critical violations, keyboard-traversal completeness, ARIA correctness, contrast minimums). Output is a `_testatlas/runs/RUN-<timestamp>.{md,json}` pair tagged `type: "accessibility"` (the JSON validates against `test-run.schema.json`) plus per-scenario evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/accessibility/` (lighthouse JSON, ARIA inventories, focus-order trails, contrast samples, screenshots). Every claim about a11y behaviour MUST be backed by evidence captured first; degrading without MCP/browser MUST mark findings `confidence: needs-validation`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/tests/matrix.json` — accessibility-typed scenarios; if none, halt.
- `prd/prd.md` §13.9 + §26.7 — the assertable a11y items and the test-type contract.
- `.testatlas/default.config.json` — `allowProductionTesting`, `safeMode` flags; default a11y thresholds.
- `.testatlas/schemas/test-run.schema.json` — required JSON shape for the RUN sidecar.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every assertion this command produces MUST cite an evidence file path under `_testatlas/evidence/runs/<run-id>/<scenario-id>/accessibility/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. **If `MCP` is unavailable, MUST NOT produce runtime accessibility findings — fall back to source-code reading via `_testatlas/12_app_map.json` and the source files it references (look for ARIA attributes, label associations, semantic HTML, color tokens). Mark every finding `confidence: needs-validation`. Add `tool_unavailable: MCP` to each artifact per `bootstrap.md` §4. Never invent lighthouse scores, ARIA roles, focus order, or contrast values from training-data priors.** **If `browser` is unavailable, MUST NOT navigate or capture runtime DOM — fall back to source-code reading per the same rules; mark findings `confidence: needs-validation`; add `tool_unavailable: browser` per `bootstrap.md` §4. Never simulate keyboard traversal, focus rings, or rendered DOM from training-data priors.** If both `MCP` AND `browser` are unavailable, halt via stop condition.
3. Verify safety flags. If the resolved target URL is a production host and `allowProductionTesting=false`, halt — do not navigate. Inspect resolved URLs, not author-claimed environments.
4. Connect to Chrome DevTools MCP and confirm the canonical accessibility toolset is reachable. The required tools (verbatim names) are:
   - `navigate_page(url)` — load the scenario's target route.
   - `wait_for(condition)` — block on selector / text / network-idle before observation.
   - `take_snapshot()` — capture the rendered accessibility tree as the source-of-truth DOM.
   - `evaluate_script(js)` — read computed ARIA roles, labels, focus order, computed colors / font sizes for contrast.
   - `lighthouse_audit(...)` — run the accessibility category and capture per-issue results plus the category score.
   - `click(selector)` — exercise interactive controls when the scenario requires a state transition.
   - `wait_for(condition)` — already listed; reused after `click` to settle dynamic states.
   - `press_key(key)` — exercise keyboard navigation (`Tab`, `Shift+Tab`, `Enter`, `Esc`).
   - `list_console_messages()` — capture JS errors that may signal a11y misuse (e.g. ARIA warnings).
   - `take_screenshot(format, fullPage)` — visual evidence for focus rings, contrast issues, and dynamic feedback states.
5. **Per scenario.** For each accessibility-typed scenario:
   a. Navigate to the target route and `wait_for` it to settle.
   b. Run `lighthouse_audit` filtered to the `accessibility` category. Persist as `lighthouse.json`.
   c. Use `evaluate_script` to dump the ARIA inventory (role, aria-*, accessible name) for every interactive element. Persist as `aria-inventory.json`.
   d. Sequence `press_key('Tab')` repeatedly from the route's initial focus; after each step capture `evaluate_script(() => document.activeElement.outerHTML)` plus a `take_screenshot` of the focus indicator. Persist as `focus-order.json` plus a `focus-trail/` screenshot directory.
   e. Sample contrast for primary headings, body, links, button labels, form labels via `evaluate_script` reading computed `color` / `background-color` / font size. Persist as `contrast-samples.json`.
   f. Capture `list_console_messages` output as `console.log.txt`.
   g. Save all evidence under `_testatlas/evidence/runs/<run-id>/<scenario-id>/accessibility/`.
6. **Threshold assertion.** Compare the captured evidence against the scenario's expected thresholds (e.g. `lighthouse.score >= 90`, `criticalViolations === 0`, `focusOrderComplete === true`, `noUnlabeledControls === true`, `minContrastRatio >= 4.5`). Status is `passed` / `failed` / `skipped` / `blocked`. Each per-result `confidence` per `bootstrap.md` §8.
7. Write `_testatlas/runs/RUN-<timestamp>.md` (human narrative — one section per scenario) and `_testatlas/runs/RUN-<timestamp>.json` with `type: "accessibility"`. Include a top-level summary: total / passed / failed / skipped / blocked, capabilities used, capabilities unavailable, environment fingerprint.
8. Validate the produced RUN JSON against `test-run.schema.json` before commit. Halt if validation fails.
9. Close the lifecycle (next section).

## Outputs

- `_testatlas/runs/RUN-<timestamp>.md` and `_testatlas/runs/RUN-<timestamp>.json` — accessibility-typed run record with per-scenario results, threshold assertions, and evidence paths.
- `_testatlas/evidence/runs/<run-id>/<scenario-id>/accessibility/` — lighthouse JSON, ARIA inventory, focus-order trail, contrast samples, console capture, screenshots.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record run id, total / passed / failed / skipped / blocked, capabilities used.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RUN pair and evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; increment `counts.runs` by one; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "RUN-`<timestamp>` (test-accessibility) — `<n>` passed / `<n>` failed / `<n>` skipped / `<n>` blocked across `<n>` a11y scenarios."

## Stop Conditions

- `_testatlas/tests/matrix.json` missing or contains zero accessibility-typed scenarios → halt; "No a11y scenarios in scope."
- Both `MCP` AND `browser` unavailable → halt; this command requires at least one runtime observation surface.
- Resolved target URL is a production host but `allowProductionTesting=false` → halt; refuse to navigate.
- `lighthouse_audit` fails for ALL audited scenarios (auth wall, infinite redirect, transport error) → halt and surface as an MCP / target-runtime issue; do not commit synthetic findings.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.
- Evidence file referenced in a result does not exist on disk after capture → halt; do not record a result citing a non-existent path.
- `test-run.schema.json` validation fails on the produced JSON → halt; do not commit a malformed run.

## Completion Criteria

- Every accessibility-typed scenario has its lighthouse JSON, ARIA inventory, and focus-order trail on disk under `_testatlas/evidence/runs/<run-id>/<scenario-id>/accessibility/`.
- Threshold assertions are applied against captured values, not extrapolated.
- The RUN JSON validates against `test-run.schema.json`.
- Manifest `counts.runs` and `counts.evidence` are updated to match disk.
- The five lifecycle files listed above are updated.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
