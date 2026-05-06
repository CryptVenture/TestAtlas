# Phase 13 — Audit Matrix

**Generated:** 2026-05-07
**Source of truth for Plans 13-02..13-09.** Do NOT re-derive in downstream plans.

This document fixes (a) which Chrome DevTools MCP tools are currently named in each of the 7 UI-touching canonical commands, (b) the verbatim frontmatter `description:` value + character length per command, (c) the verbatim `capabilities:` array per command, (d) the prioritized gap list, and (e) the 5 walkthrough-pattern names that Plan 13-02 must embed in the new `.testatlas/reference/chrome-devtools-mcp.md` shard.

Cell contents come from `grep -n -m1 '\b<tool>\b' .testatlas/commands/<file>.md` against the working-tree `.testatlas/commands/*.md` files. `present (line N)` cites the first occurrence; `MISSING` means zero occurrences.

The 7 UI-touching commands audited:

- `explore-ui.md` (137 lines)
- `explore-accessibility.md` (124 lines)
- `explore-performance.md` (131 lines)
- `test-flow.md` (141 lines)
- `test-domain.md` (127 lines)
- `test-accessibility.md` (120 lines)
- `test-performance.md` (119 lines)

Tier names follow 13-RESEARCH.md §"Toolset Audit" → "Recommendation" (lines 134–146).

---

## Section 1 — Per-command tool presence matrix

### Tier 1 — mandatory toolset for every UI command

| Tool | explore-ui | explore-accessibility | explore-performance | test-flow | test-domain | test-accessibility | test-performance |
|------|------------|-----------------------|---------------------|-----------|-------------|--------------------|------------------|
| `navigate_page` | present (line 74) | present (line 68) | present (line 72) | MISSING | MISSING | present (line 58) | present (line 60) |
| `wait_for` | present (line 75) | present (line 69) | present (line 73) | MISSING | MISSING | present (line 59) | present (line 61) |
| `take_snapshot` | present (line 76) | present (line 70) | MISSING | MISSING | MISSING | present (line 60) | present (line 67) |
| `take_screenshot` | present (line 77) | present (line 74) | MISSING | MISSING | MISSING | present (line 67) | present (line 71) |
| `list_console_messages` | present (line 80) | MISSING | MISSING | MISSING | MISSING | present (line 66) | MISSING |
| `list_network_requests` | present (line 81) | MISSING | present (line 77) | MISSING | MISSING | MISSING | present (line 68) |
| `evaluate_script` | present (line 79) | present (line 71) | MISSING | MISSING | MISSING | present (line 61) | present (line 69) |
| `handle_dialog` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |

**Tier 1 totals:** 7 × 8 = 56 cells. Present: 27. MISSING: 29.

### Tier 2 — mandatory when interactive surfaces present (forms / modals / DnD / uploads)

| Tool | explore-ui | explore-accessibility | explore-performance | test-flow | test-domain | test-accessibility | test-performance |
|------|------------|-----------------------|---------------------|-----------|-------------|--------------------|------------------|
| `click` | present (line 78) | MISSING | present (line 79) | MISSING | MISSING | present (line 63) | MISSING |
| `fill` | present (line 78) | MISSING | present (line 79) | MISSING | MISSING | MISSING | MISSING |
| `fill_form` | present (line 78) | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `press_key` | MISSING | present (line 73) | MISSING | MISSING | MISSING | present (line 65) | MISSING |
| `hover` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `type_text` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `upload_file` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `drag` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |

**Tier 2 totals:** 7 × 8 = 56 cells. Present: 8. MISSING: 48.

### Tier 3 — mandatory for a11y commands

| Tool | explore-ui | explore-accessibility | explore-performance | test-flow | test-domain | test-accessibility | test-performance |
|------|------------|-----------------------|---------------------|-----------|-------------|--------------------|------------------|
| `lighthouse_audit` | present (line 82) | present (line 4) | MISSING | MISSING | MISSING | present (line 4) | present (line 64) |

**Tier 3 totals:** 7 × 1 = 7 cells. Present: 4. MISSING: 3. (a11y-relevant rows: explore-accessibility = present, test-accessibility = present.)

### Tier 4 — mandatory for perf commands

| Tool | explore-ui | explore-accessibility | explore-performance | test-flow | test-domain | test-accessibility | test-performance |
|------|------------|-----------------------|---------------------|-----------|-------------|--------------------|------------------|
| `performance_start_trace` | MISSING | MISSING | present (line 74) | MISSING | MISSING | MISSING | present (line 62) |
| `performance_stop_trace` | MISSING | MISSING | present (line 74) | MISSING | MISSING | MISSING | present (line 63) |
| `performance_analyze_insight` | MISSING | MISSING | present (line 75) | MISSING | MISSING | MISSING | present (line 65) |
| `emulate` | MISSING | MISSING | present (line 4) | MISSING | MISSING | MISSING | present (line 4) |

**Tier 4 totals:** 7 × 4 = 28 cells. Present: 8. MISSING: 20. (perf-relevant rows: explore-performance + test-performance both fully covered.)

### Tier 5 — mandatory for multi-tab flows

| Tool | explore-ui | explore-accessibility | explore-performance | test-flow | test-domain | test-accessibility | test-performance |
|------|------------|-----------------------|---------------------|-----------|-------------|--------------------|------------------|
| `new_page` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `select_page` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `list_pages` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |
| `close_page` | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING | MISSING |

**Tier 5 totals:** 7 × 4 = 28 cells. Present: 0. MISSING: 28. (zero coverage anywhere — flagged for `test-flow` auth-popup + `test-domain` integration mode in 13-07.)

### Cross-tier headline numbers

| Scope | Present | MISSING | Total cells |
|-------|---------|---------|-------------|
| Tier 1 | 27 | 29 | 56 |
| Tier 2 | 8 | 48 | 56 |
| Tier 3 | 4 | 3 | 7 |
| Tier 4 | 8 | 20 | 28 |
| Tier 5 | 0 | 28 | 28 |
| **Grand total** | **47** | **128** | **175** |

The two commands with **zero** tool name references — `test-flow.md` and `test-domain.md` — drive the largest rewrite cost in Plan 13-07. They currently delegate everything to "the matrix" without naming MCP tools at all.

---

## Section 2 — Frontmatter description audit

For each command, verbatim `description:` value, current character length, and walkthrough-vocabulary flag. Flag `WALKTHROUGH-MENTION-MISSING` means none of `walkthrough` / `walk through` / `every component` / `every state` appears in the description.

| Command | Length | Flag | Verbatim `description:` |
|---------|--------|------|--------------------------|
| `explore-ui` | 227 | WALKTHROUGH-MENTION-MISSING | Map routes, components, forms, modals, all PRD §13.1 UI states (empty/loading/error/success/permission), responsive breakpoints, and accessibility basics using Chrome DevTools MCP — degrade to code reading when MCP unavailable. |
| `explore-accessibility` | 195 | WALKTHROUGH-MENTION-MISSING | Evaluate keyboard nav, focus, labels, semantics, contrast, and dynamic feedback per PRD §13.9 using Chrome DevTools MCP lighthouse_audit + ARIA introspection; degrade to code-reading without MCP. |
| `explore-performance` | 207 | WALKTHROUGH-MENTION-MISSING | Detect user-visible slowness, blocking interactions, retries, and reliability per PRD §13.10 using Chrome DevTools MCP performance traces + emulate for throttling; degrade to source-code reading without MCP. |
| `test-flow` | 163 | WALKTHROUGH-MENTION-MISSING | Execute scenarios from tests/matrix.json against the running target product, capture per-state evidence, and emit RUN-<timestamp>.{md,json} per PRD §12.15 and §13. |
| `test-domain` | 157 | WALKTHROUGH-MENTION-MISSING | Execute domain-scoped test scenarios across PRD §26 modes (negative / state / integration / setup-testability); the scenario's `type` field selects the mode. |
| `test-accessibility` | 203 | WALKTHROUGH-MENTION-MISSING | Execute accessibility-typed scenarios using Chrome DevTools MCP lighthouse_audit + ARIA introspection; assert against PRD §13.9 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario a11y findings. |
| `test-performance` | 208 | WALKTHROUGH-MENTION-MISSING | Execute performance-typed scenarios using Chrome DevTools MCP performance traces + emulate for throttling; assert against PRD §13.10 thresholds; emit RUN-<timestamp>.{md,json} with per-scenario perf findings. |

**Inventory finding:** all 7 descriptions are flagged `WALKTHROUGH-MENTION-MISSING`. Plan 13-08 must add at least one of the four discriminator phrases to every description while staying close to the existing length (target window: 150–230 characters; cap at 250 to stay under the 200-char convention's tolerance band).

**MCP-manifest implication (per 13-RESEARCH.md §"Adapter Propagation Path" line 564):** the frontmatter `description` is the *only* user-visible surface for the MCP adapter. A walkthrough-discipline rewrite of the body without a description rewrite leaves MCP clients seeing stale promises. Plan 13-08 is therefore not optional cosmetic — it is the user-visible delivery of the phase.

---

## Section 3 — Capability declaration audit

Verbatim `capabilities:` array per command, plus per-command flags.

| Command | `capabilities:` (verbatim) | Flag |
|---------|----------------------------|------|
| `explore-ui` | `[browser, MCP, file-write]` | OK — matches RESEARCH §"Plan Sketch" expectation |
| `explore-accessibility` | `[browser, MCP, file-write]` | OK |
| `explore-performance` | `[browser, MCP, shell, file-write]` | OK |
| `test-flow` | `[shell, browser, file-write]` | **CAPABILITY-GAP: missing `MCP`.** RESEARCH §"Plan Sketch" recommends adding `MCP` so the mandatory-when-available contract attaches. Decision lives in Plan 13-07; this plan only records current state. |
| `test-domain` | `[shell, file-write]` | **CAPABILITY-GAP: missing `browser` and `MCP` despite UI walkthrough relevance** for the `state` and `negative` modes (per PRD §26.5–26.6). Decision lives in Plan 13-07 — likely outcome is to keep the array as-is and use the `state`/`integration` branches' inline tool requirements rather than adding capability, because adding capability cascades through `capability-fallback.test.js`. Recorded for downstream resolution. |
| `test-accessibility` | `[browser, MCP, file-write]` | OK |
| `test-performance` | `[browser, MCP, shell, file-write]` | OK |

**Net:** 5 of 7 commands declare correct capabilities; 2 (`test-flow`, `test-domain`) carry capability gaps that Plan 13-07 must resolve.

---

## Section 4 — Gaps prioritized by tier

Reproduces 13-RESEARCH.md §"Gaps — tools available upstream but unused in command bodies" (lines 116–134) **in priority order: Tier 1 > Tier 2 > Tier 3 > Tier 4 > Tier 5**, with the specific commands needing each addition.

### Tier 1 gaps (highest priority — every UI command must carry these)

1. **`handle_dialog`** — MISSING in all 7 commands. Without it, `alert`/`confirm`/`beforeunload`/native dialog flows hang or fabricate. Add to: `explore-ui` (modal walkthrough), `test-flow` (form-submit), `test-domain` (negative type), `explore-accessibility` (a11y dialogs), `test-accessibility`. Also reference inline in `test-performance` because `beforeunload` interferes with traces. **Tier 1 priority: critical.**
2. **`take_snapshot`** — MISSING in `explore-performance`, `test-flow`, `test-domain`. Add for accessibility-tree capture before/after each interaction.
3. **`take_screenshot`** — MISSING in `explore-performance`, `test-flow`, `test-domain`. Add for visual evidence at every state.
4. **`list_console_messages`** — MISSING in `explore-accessibility`, `explore-performance`, `test-flow`, `test-domain`, `test-performance`. Add for surfacing aria warnings (a11y), uncaught errors (perf retry signal), and trace-side console activity.
5. **`list_network_requests`** — MISSING in `explore-accessibility`, `test-flow`, `test-domain`, `test-accessibility`. Add for status-code evidence (permission state, error state, a11y network-driven announcements).
6. **`evaluate_script`** — MISSING in `explore-performance`, `test-flow`, `test-domain`. Add for inducing fail-injection, focus inspection, ARIA inventory dumps, computed-style sampling.
7. **`navigate_page` + `wait_for`** — MISSING in `test-flow`, `test-domain`. The two commands today contain zero MCP tool names; full Tier-1 stamp required.

### Tier 2 gaps (mandatory wherever interactive surfaces exist)

8. **`hover`** — MISSING in all 7. Add to `explore-ui` (state-coverage walkthrough), `test-flow` (tooltip + dropdown verification).
9. **`type_text`** — MISSING in all 7. Add to `explore-ui` and `test-flow` for real keyboard typing (`fill` skips `keypress`/IME-driven autocomplete).
10. **`upload_file`** — MISSING in all 7. Add to `test-flow` (interactive surface) and `test-domain` (setup-testability mode for upload fixtures).
11. **`drag`** — MISSING in all 7. Add to `explore-ui` (interactive surface — kanban/reorder/file-drop flows).
12. **`press_key`** — MISSING in `explore-ui`, `explore-performance`, `test-flow`, `test-domain`, `test-performance`. Add for Tab/Enter/Escape coverage (modal dismiss, form submit, focus order). Note: present in `explore-accessibility` (line 73) and `test-accessibility` (line 65).
13. **`click`** — MISSING in `explore-accessibility`, `test-flow`, `test-domain`, `test-performance`. Add for primary-action drive-through.
14. **`fill` / `fill_form`** — MISSING in `explore-accessibility`, `test-flow`, `test-domain`, `test-accessibility`, `test-performance`. Add per command's interactive surface needs.

### Tier 3 gaps (a11y-mandatory)

15. **`lighthouse_audit`** — MISSING in `test-flow`, `test-domain` (acceptable: those commands' a11y assertions belong inside `test-accessibility`). No action needed for `test-flow`/`test-domain`. The 3 a11y-or-perf-touching commands that need it (`explore-accessibility`, `test-accessibility`, `test-performance`) all have it. **Tier 3 priority: low — coverage already complete.**

### Tier 4 gaps (perf-mandatory)

16. **`emulate`** — MISSING in `explore-ui` (state-coverage `loading` requires `emulate({ networkConditions: "Slow 3G" })` per RESEARCH §"State-Coverage Matrix" line 473). Add to `explore-ui`. Also missing in a11y commands; not required there.
17. **`performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight`** — present in `explore-performance` and `test-performance` (the only commands that need them). **Tier 4 priority: low — coverage complete for perf-typed commands.**

### Tier 5 gaps (multi-tab — zero coverage anywhere)

18. **`new_page` / `select_page` / `list_pages` / `close_page`** — MISSING in all 7. Add to `test-flow` (auth-popup OAuth flow) and `test-domain` (integration mode where third-party tabs open). All other commands not affected. **Tier 5 priority: medium — required for any auth flow walkthrough; can land in 13-07.**

### Net rewrite cost per command (Tier-1+2 + per-command-specific tier additions)

| Command | Tier-1 missing | Tier-2 missing (interactive) | Tier-3 | Tier-4 | Tier-5 | Net new tool names to add |
|---------|----------------|------------------------------|--------|--------|--------|----------------------------|
| `explore-ui` | 1 (`handle_dialog`) | 4 (`hover`, `type_text`, `drag`, `press_key`) | 0 | 1 (`emulate`) | 0 | 6 |
| `explore-accessibility` | 4 (`list_console_messages`, `list_network_requests`, `handle_dialog`, others) | 1 (`click`) | 0 | 0 | 0 | 5 |
| `explore-performance` | 5 (`take_snapshot`, `take_screenshot`, `list_console_messages`, `evaluate_script`, `handle_dialog`) | 0 | 0 | 0 | 0 | 5 |
| `test-flow` | 8 (full Tier-1 + `handle_dialog`) | 7 (most Tier-2) | 0 | 0 | 4 (full Tier-5 for auth popups) | 19 |
| `test-domain` | 8 (full Tier-1 + `handle_dialog`) | 5 (key Tier-2 for state/negative) | 0 | 0 | 4 (full Tier-5 for integration) | 17 |
| `test-accessibility` | 2 (`list_network_requests`, `handle_dialog`) | 0 | 0 | 0 | 0 | 2 |
| `test-performance` | 2 (`list_console_messages`, `handle_dialog`) | 0 | 0 | 0 | 0 | 2 |

`test-flow` and `test-domain` carry the largest deltas. Plan 13-07 is the heaviest rewrite.

---

## Section 5 — Reference-shard plan inputs

13-RESEARCH.md §"Walkthrough Patterns" (lines 150–386) defines five canonical walkthrough patterns. Plan 13-02 (reference shard authoring) MUST embed all five into `.testatlas/reference/chrome-devtools-mcp.md`, using verbatim MCP tool names — no paraphrasing, no synonyms.

The five walkthrough categories:

1. **Component-discovery walkthrough** (RESEARCH lines 154–177) — used by `explore-ui`. Per route: `navigate_page` → `wait_for` → `take_snapshot` → `take_screenshot` (full page) → `list_console_messages` + `list_network_requests` → `evaluate_script` to enumerate components → `resize_page` × {375, 768, 1280} → persist `snapshot.json`, `components.json`, `console.log.txt`, `network.json` → register entry in `app-map.json` citing evidence paths. Skip rationale: `wait_for` timeouts mark the route `confidence: needs-validation` with `tool_unavailable`.
2. **State-coverage walkthrough** (RESEARCH lines 178–229) — used by `explore-ui` AND by the `state` branch of `test-domain`. Per route × per interactive surface (form / modal / menu / search / filter): drive each of the 5 PRD §13.1 states (empty / loading / error / success / permission) through `navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `emulate({ networkConditions: "Slow 3G" })` for loading induction, `fill_form` + invalid payload + `click(submit)` for error induction, `evaluate_script` cookie clearing for permission induction, `handle_dialog({ accept: false })` registered before any action that might open a native dialog.
3. **Interactive-surface walkthrough** (RESEARCH lines 231–278) — used by `test-flow` AND `test-domain`. Forms via `fill_form` validation matrix → `click([type=submit])` → `wait_for([role=alert])` → `evaluate_script` to harvest error text → assert + retry happy path. Modals via `click(openSelector)` → `wait_for([role=dialog])` → `take_snapshot` + `take_screenshot` → tab-trap loop using `press_key("Tab")` + `evaluate_script(() => document.activeElement.outerHTML)` until cycle confirmed → `press_key("Escape")` → `wait_for(modal closed)`. Navigation via `evaluate_script` link enumeration → sample N internal links → `navigate_page` each → assert status from `list_network_requests`. Keyboard via skip-to-content `press_key("Tab")` first-focus assertion.
4. **A11y walkthrough** (RESEARCH lines 280–342) — used by `explore-accessibility` AND `test-accessibility`. Per route: `lighthouse_audit({ categories: ["accessibility"] })` → assert score >= 0.90 + zero critical violations (PRD §13.9). ARIA inventory via `evaluate_script` querying `button, a, input, [role=button], [role=link]` for accessible names → assert zero unlabeled. Focus order via `press_key("Tab")` × 50 + `evaluate_script(() => document.activeElement)` → persist `focus-order.json` → assert all visible (PRD §13.9 focus state). Contrast samples via `evaluate_script` `getComputedStyle` over `h1/h2/p/a/button/label/input` × first 3. Dynamic feedback via `take_snapshot` pre/post a triggering action → diff `aria-live` regions.
5. **Perf walkthrough** (RESEARCH lines 344–385) — used by `explore-performance` AND `test-performance`. Two passes (`baseline` and `throttled`) per route in selected set: `emulate({ cpuThrottlingRate, networkConditions })` → `navigate_page` → `wait_for(main, #root)` → `performance_start_trace({ reload: true, autoStop: false })` → drive primary interaction (`click` + `type_text` + `click(submit)` for form routes; `click(primaryActionSelector)` + `wait_for({ networkIdleMs: 500 })` otherwise) → `performance_stop_trace` → `performance_analyze_insight({ trace })` → `list_network_requests` → `take_snapshot` + `take_screenshot` → assert PRD §13.10 thresholds (`LCP <= 2500ms`, `INP <= 200ms`, `CLS <= 0.1`, `totalBlockingTime <= 300ms`, zero retries, longTasks > 50ms <= K).

**Cross-reference lock-in for Plan 13-02:** the reference shard authored in 13-02 MUST cite each pattern by the exact name above (`Component-discovery walkthrough`, `State-coverage walkthrough`, `Interactive-surface walkthrough`, `A11y walkthrough`, `Perf walkthrough`) so command bodies in 13-04..13-07 can reference them by `## <name>` link without ambiguity.

**Source:** 13-RESEARCH.md §"Toolset Audit" lines 86–146 (tier definitions) and §"Walkthrough Patterns" lines 150–386 (pattern bodies).

---

## Appendix A — Flattened (command × tool) cell index

Machine-friendly flat index of every cell in Section 1. One line per (command, tool). Useful for grep-driven verification by downstream plans (`grep '<command>:<tool>' audit-matrix.md`). Format: `<command>:<tool> = present (line N) | MISSING`.

- explore-ui:navigate_page = present (line 74)
- explore-ui:wait_for = present (line 75)
- explore-ui:take_snapshot = present (line 76)
- explore-ui:take_screenshot = present (line 77)
- explore-ui:list_console_messages = present (line 80)
- explore-ui:list_network_requests = present (line 81)
- explore-ui:evaluate_script = present (line 79)
- explore-ui:handle_dialog = MISSING
- explore-ui:click = present (line 78)
- explore-ui:fill = present (line 78)
- explore-ui:fill_form = present (line 78)
- explore-ui:press_key = MISSING
- explore-ui:hover = MISSING
- explore-ui:type_text = MISSING
- explore-ui:upload_file = MISSING
- explore-ui:drag = MISSING
- explore-ui:lighthouse_audit = present (line 82)
- explore-ui:performance_start_trace = MISSING
- explore-ui:performance_stop_trace = MISSING
- explore-ui:performance_analyze_insight = MISSING
- explore-ui:emulate = MISSING
- explore-ui:new_page = MISSING
- explore-ui:select_page = MISSING
- explore-ui:list_pages = MISSING
- explore-ui:close_page = MISSING
- explore-accessibility:navigate_page = present (line 68)
- explore-accessibility:wait_for = present (line 69)
- explore-accessibility:take_snapshot = present (line 70)
- explore-accessibility:take_screenshot = present (line 74)
- explore-accessibility:list_console_messages = MISSING
- explore-accessibility:list_network_requests = MISSING
- explore-accessibility:evaluate_script = present (line 71)
- explore-accessibility:handle_dialog = MISSING
- explore-accessibility:click = MISSING
- explore-accessibility:fill = MISSING
- explore-accessibility:fill_form = MISSING
- explore-accessibility:press_key = present (line 73)
- explore-accessibility:hover = MISSING
- explore-accessibility:type_text = MISSING
- explore-accessibility:upload_file = MISSING
- explore-accessibility:drag = MISSING
- explore-accessibility:lighthouse_audit = present (line 4)
- explore-accessibility:performance_start_trace = MISSING
- explore-accessibility:performance_stop_trace = MISSING
- explore-accessibility:performance_analyze_insight = MISSING
- explore-accessibility:emulate = MISSING
- explore-accessibility:new_page = MISSING
- explore-accessibility:select_page = MISSING
- explore-accessibility:list_pages = MISSING
- explore-accessibility:close_page = MISSING
- explore-performance:navigate_page = present (line 72)
- explore-performance:wait_for = present (line 73)
- explore-performance:take_snapshot = MISSING
- explore-performance:take_screenshot = MISSING
- explore-performance:list_console_messages = MISSING
- explore-performance:list_network_requests = present (line 77)
- explore-performance:evaluate_script = MISSING
- explore-performance:handle_dialog = MISSING
- explore-performance:click = present (line 79)
- explore-performance:fill = present (line 79)
- explore-performance:fill_form = MISSING
- explore-performance:press_key = MISSING
- explore-performance:hover = MISSING
- explore-performance:type_text = MISSING
- explore-performance:upload_file = MISSING
- explore-performance:drag = MISSING
- explore-performance:lighthouse_audit = MISSING
- explore-performance:performance_start_trace = present (line 74)
- explore-performance:performance_stop_trace = present (line 74)
- explore-performance:performance_analyze_insight = present (line 75)
- explore-performance:emulate = present (line 4)
- explore-performance:new_page = MISSING
- explore-performance:select_page = MISSING
- explore-performance:list_pages = MISSING
- explore-performance:close_page = MISSING
- test-flow:navigate_page = MISSING
- test-flow:wait_for = MISSING
- test-flow:take_snapshot = MISSING
- test-flow:take_screenshot = MISSING
- test-flow:list_console_messages = MISSING
- test-flow:list_network_requests = MISSING
- test-flow:evaluate_script = MISSING
- test-flow:handle_dialog = MISSING
- test-flow:click = MISSING
- test-flow:fill = MISSING
- test-flow:fill_form = MISSING
- test-flow:press_key = MISSING
- test-flow:hover = MISSING
- test-flow:type_text = MISSING
- test-flow:upload_file = MISSING
- test-flow:drag = MISSING
- test-flow:lighthouse_audit = MISSING
- test-flow:performance_start_trace = MISSING
- test-flow:performance_stop_trace = MISSING
- test-flow:performance_analyze_insight = MISSING
- test-flow:emulate = MISSING
- test-flow:new_page = MISSING
- test-flow:select_page = MISSING
- test-flow:list_pages = MISSING
- test-flow:close_page = MISSING
- test-domain:navigate_page = MISSING
- test-domain:wait_for = MISSING
- test-domain:take_snapshot = MISSING
- test-domain:take_screenshot = MISSING
- test-domain:list_console_messages = MISSING
- test-domain:list_network_requests = MISSING
- test-domain:evaluate_script = MISSING
- test-domain:handle_dialog = MISSING
- test-domain:click = MISSING
- test-domain:fill = MISSING
- test-domain:fill_form = MISSING
- test-domain:press_key = MISSING
- test-domain:hover = MISSING
- test-domain:type_text = MISSING
- test-domain:upload_file = MISSING
- test-domain:drag = MISSING
- test-domain:lighthouse_audit = MISSING
- test-domain:performance_start_trace = MISSING
- test-domain:performance_stop_trace = MISSING
- test-domain:performance_analyze_insight = MISSING
- test-domain:emulate = MISSING
- test-domain:new_page = MISSING
- test-domain:select_page = MISSING
- test-domain:list_pages = MISSING
- test-domain:close_page = MISSING
- test-accessibility:navigate_page = present (line 58)
- test-accessibility:wait_for = present (line 59)
- test-accessibility:take_snapshot = present (line 60)
- test-accessibility:take_screenshot = present (line 67)
- test-accessibility:list_console_messages = present (line 66)
- test-accessibility:list_network_requests = MISSING
- test-accessibility:evaluate_script = present (line 61)
- test-accessibility:handle_dialog = MISSING
- test-accessibility:click = present (line 63)
- test-accessibility:fill = MISSING
- test-accessibility:fill_form = MISSING
- test-accessibility:press_key = present (line 65)
- test-accessibility:hover = MISSING
- test-accessibility:type_text = MISSING
- test-accessibility:upload_file = MISSING
- test-accessibility:drag = MISSING
- test-accessibility:lighthouse_audit = present (line 4)
- test-accessibility:performance_start_trace = MISSING
- test-accessibility:performance_stop_trace = MISSING
- test-accessibility:performance_analyze_insight = MISSING
- test-accessibility:emulate = MISSING
- test-accessibility:new_page = MISSING
- test-accessibility:select_page = MISSING
- test-accessibility:list_pages = MISSING
- test-accessibility:close_page = MISSING
- test-performance:navigate_page = present (line 60)
- test-performance:wait_for = present (line 61)
- test-performance:take_snapshot = present (line 67)
- test-performance:take_screenshot = present (line 71)
- test-performance:list_console_messages = MISSING
- test-performance:list_network_requests = present (line 68)
- test-performance:evaluate_script = present (line 69)
- test-performance:handle_dialog = MISSING
- test-performance:click = MISSING
- test-performance:fill = MISSING
- test-performance:fill_form = MISSING
- test-performance:press_key = MISSING
- test-performance:hover = MISSING
- test-performance:type_text = MISSING
- test-performance:upload_file = MISSING
- test-performance:drag = MISSING
- test-performance:lighthouse_audit = present (line 64)
- test-performance:performance_start_trace = present (line 62)
- test-performance:performance_stop_trace = present (line 63)
- test-performance:performance_analyze_insight = present (line 65)
- test-performance:emulate = present (line 4)
- test-performance:new_page = MISSING
- test-performance:select_page = MISSING
- test-performance:list_pages = MISSING
- test-performance:close_page = MISSING

**Total flattened cells:** 7 commands × 25 tools = 175 lines. Use `grep -c MISSING` and `grep -c 'present (line'` against this appendix for fast machine summarization.
