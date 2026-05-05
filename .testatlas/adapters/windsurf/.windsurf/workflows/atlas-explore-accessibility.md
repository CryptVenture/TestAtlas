---
description: Evaluate keyboard nav, focus, labels, semantics, contrast, and dynamic feedback per PRD §13.9 using Chrome DevTools MCP lighthouse_audit + ARIA introspection; degrade to code-reading without MCP.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-accessibility.md" hash="9b39eff6a62b36ddeac9f42cd44641ef938b51eb2b8f13a6b0518e1140b346b3" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Evaluate the target product's accessibility per PRD §13.9: keyboard navigability, focus management, label and name correctness, semantic HTML and ARIA, color contrast, and dynamic feedback (toasts, live regions, route-change focus). Run a Chrome DevTools MCP-driven audit across the routes catalogued in `_testatlas/12_app_map.json` and persist evidence under `_testatlas/evidence/explore-accessibility/<timestamp>/` (lighthouse JSON, ARIA inventories, focus-order traces, contrast samples, screenshots). Findings are scored per PRD §13.9 severity (critical / serious / moderate / minor) and confidence per `bootstrap.md` §8. This command is finding-producing — every finding MUST cite an evidence path that exists on disk.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `_testatlas/11_workspace_manifest.json` — confirm initialization status and counts.
- `_testatlas/12_app_map.json` — the route + component entries to audit.
- `prd/prd.md` §13.9 — must-discover items the audit must address.
- `.testatlas/default.config.json` — `allowProductionTesting`, `safeMode` flags.
- `.testatlas/schemas/evidence.schema.json` — evidence sidecar shape.

## Sub-Agent Task Brief Contract

This command works as both a parallel sub-agent (when `/atlas:explore` spawns it) and a standalone slash invocation. When called as a sub-agent, the brief received from the umbrella matches the contract below; when called standalone, the agent fills the brief from the defaults documented here.

- **objective:** Audit accessibility — WCAG 2.2 AA gaps, keyboard navigation, focus order, screen-reader landmarks, color contrast, ARIA labels — of the target product's UI surface.
- **scope:** Every user-facing route in `_testatlas/12_app_map.json`; excludes API-only routes, internal admin tooling unless flagged, and headless services.
- **files-to-read:** `_testatlas/12_app_map.json`; `prd/prd.md` §13.9 (accessibility must-discover items); `.testatlas/default.config.json` (`safeMode`, `allowProductionTesting`); `.testatlas/schemas/evidence.schema.json`.
- **output-format:** Markdown findings list — one finding per WCAG-relevant gap — with severity, success-criterion id (e.g. WCAG 2.4.7 Focus Visible), evidence path, recommended remediation. Evidence (axe-core JSON, keyboard-nav recordings, screenshots, contrast-ratio dumps) under `_testatlas/evidence/explore-accessibility/<timestamp>/`.
- **may-write:** When called as a sub-agent the umbrella's brief controls write permissions (default: NO direct `_testatlas/` writes — the umbrella aggregates findings). When called standalone, this command MAY write the artifacts listed under `## Outputs`.
- **exit-criteria:** Every audited route has a WCAG-aligned report; gaps cite both the rule and on-disk evidence; production hosts skipped when `allowProductionTesting=false`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/explore-accessibility/<timestamp>/` that exists on disk. Fabricated paths fail `validate-workspace`.
2. Verify capabilities. **If `MCP` is unavailable, MUST NOT produce runtime accessibility findings — fall back to code reading via `app-map` (`12_app_map.json`) and the source files it references (look for ARIA attributes, label associations, semantic HTML elements). Mark every finding `confidence: needs-validation`. Add `tool_unavailable: MCP` to each artifact per `bootstrap.md` §4. Never invent lighthouse scores, contrast ratios, focus order, or ARIA findings from training-data priors.** **If `browser` is unavailable, MUST NOT navigate or capture runtime DOM — fall back to source-code reading per the same rules; mark findings `confidence: needs-validation`; add `tool_unavailable: browser` per `bootstrap.md` §4. Never simulate keyboard traversal, focus rings, or rendered DOM from training-data priors.** If both `MCP` AND `browser` are unavailable, halt via stop condition.
3. Verify safety flags. If the resolved target URL is a production host and `allowProductionTesting=false`, halt — do not navigate. Inspect resolved URLs, not author-claimed environments.
4. Connect to Chrome DevTools MCP and confirm the canonical accessibility toolset is reachable. The required tools (verbatim names) are:
   - `navigate_page(url)` — load a target route.
   - `wait_for(condition)` — wait for the route to settle (network idle, selector visible, or title text).
   - `take_snapshot()` — capture the rendered accessibility tree as the source-of-truth DOM.
   - `evaluate_script(js)` — read computed ARIA roles, labels, focus order, and contrast samples from the live DOM.
   - `lighthouse_audit(...)` — run the accessibility category and capture per-issue results plus the category score.
   - `press_key(key)` — exercise keyboard navigation (`Tab`, `Shift+Tab`, `Enter`, `Esc`, `ArrowDown`, etc.).
   - `take_screenshot(format, fullPage)` — visual evidence for focus rings, contrast issues, and dynamic feedback states.
5. For each route in `_testatlas/12_app_map.json`, navigate, wait for the route to settle, then run `lighthouse_audit` filtered to the `accessibility` category. Persist the lighthouse JSON under `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/lighthouse.json`. Record the category score and the per-issue list.
6. Exercise keyboard navigation. From the route's initial focus, sequence `press_key('Tab')` repeatedly (and `Shift+Tab` to verify reverse order); after each step, capture `evaluate_script(() => document.activeElement.outerHTML)` plus `take_screenshot` of the focus indicator. Save the captured trail as `focus-order.json` and the screenshots under `focus-trail/`. Note focus traps, hidden focus targets, missing visible indicators, and skip-link presence.
7. Inventory ARIA. Use `evaluate_script` to dump `role`, `aria-*` attributes, and accessible names for every interactive element (`button`, `a`, `input`, `[role]`). Save as `aria-inventory.json` per route. Cross-check that interactive controls have accessible names and that landmark roles are present.
8. Check contrast. For each text node, use `evaluate_script` to read computed `color`, `background-color`, and effective font size; sample at least the page's primary headings, body copy, links, button labels, and form labels. Save as `contrast-samples.json` per route. Pair samples with a `take_screenshot` so reviewers can verify visually.
9. Exercise dynamic feedback. Trigger toasts, banners, modals, and route changes; capture `take_snapshot` pre/post and `take_screenshot` of the live region or focus target. Verify that route changes move focus and that ARIA live regions announce new content. Save under `dynamic-feedback/`.
10. Aggregate findings into `_testatlas/evidence/explore-accessibility/<timestamp>/findings.md` with severity per PRD §13.9 (critical / serious / moderate / minor) and confidence per `bootstrap.md` §8. Every finding cites at least one evidence path created in steps 5–9.
11. Close the lifecycle (next section).

## Outputs

- `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/lighthouse.json` — accessibility category score plus per-issue list, one per audited route.
- `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/focus-order.json` and `focus-trail/` screenshots — keyboard traversal evidence.
- `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/aria-inventory.json` — roles, accessible names, ARIA attributes per interactive element.
- `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/contrast-samples.json` — computed-style samples paired with screenshots.
- `_testatlas/evidence/explore-accessibility/<timestamp>/<route-slug>/dynamic-feedback/` — pre/post snapshots and screenshots for toasts, modals, route-change focus.
- `_testatlas/evidence/explore-accessibility/<timestamp>/findings.md` — aggregated findings with severity and evidence paths.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence-directory path, audited route count, and findings count by severity.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this run.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative entry: "Audited `<n>` routes for accessibility — `<n>` critical / `<n>` serious / `<n>` moderate / `<n>` minor findings."

## Stop Conditions

- `_testatlas/12_app_map.json` missing or contains zero routes → halt; recommend `/atlas:explore-codebase` first.
- Both `MCP` AND `browser` unavailable → halt; this command requires at least one runtime observation surface.
- Resolved target URL is a production host but `allowProductionTesting=false` → halt; refuse to navigate.
- `lighthouse_audit` fails for ALL audited routes (auth wall, infinite redirect, transport error) → halt and surface as an MCP / target-runtime issue; do not commit synthetic findings.
- Any required step would mutate target-repo source files → halt; the workspace lives only under `_testatlas/`.

## Completion Criteria

- Every audited route cites a `lighthouse.json` evidence file that exists on disk.
- ARIA inventory, focus-order trail, and contrast samples captured for at least the sampled routes.
- `findings.md` exists and lists each finding with severity, confidence, and at least one evidence path.
- The five lifecycle files listed above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.

## What's Next

Now that accessibility findings are recorded:

- **`/atlas:test-accessibility`** — execute targeted a11y scenarios against the worst offenders
- **`/atlas:plan`** — fold a11y findings into the test plan
- **`/atlas:log-issue`** — file individual issues for high-severity findings
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
