# Chrome DevTools MCP Walkthrough Reference

> **When to read this:** You are executing a UI-touching command (`explore-ui`, `explore-accessibility`, `explore-performance`, `test-flow`, `test-domain`, `test-accessibility`, `test-performance`) and need the canonical walkthrough patterns + tool tiering + state-coverage matrix. Command bodies link here from `## Required First Reads` so each command stays inside its 1800-word budget while still binding the agent to the full walkthrough contract.

This shard is the single source of truth for the Chrome DevTools MCP toolset, the mandatory-when-available contract, the five canonical walkthrough patterns, the five-state coverage matrix (PRD §13.1), and the evidence-persistence mapping (PRD §18). Do NOT duplicate this prose into command bodies — link.

## 1. Mandatory-when-available contract

When `browser` AND `MCP` are both available in this adapter context (verified via `.testatlas/reference/capabilities.md` per-capability action matrix), UI-touching commands MUST drive the full walkthrough patterns described in §3 below. Skipping a walkthrough step when the underlying tool is reachable — *because the agent thinks the result is predictable, because training-data priors tell the agent what the page contains, or because exhaustive coverage feels excessive* — is a contract violation equivalent to fabricating evidence. The walkthrough is the contract. If a step legitimately cannot run (the surface does not exist on this route, the tool returns an error after retry), record the skip rationale on the resulting artifact entry. **MUST NOT skip silently.**

This contract layers on top of, does not replace, each command's existing capability-fallback prose. Both sides are needed:

- **Negative side** (existing, enforced by `test/commands/capability-fallback.test.js` + `test/commands/anti-hallucination.test.js`): when capability is missing, MUST NOT fabricate output. Mark `confidence: needs-validation` and tag `tool_unavailable: <cap>`.
- **Positive side** (this shard, enforced by `test/commands/walkthrough-mandatory.test.js`): when capability is present, MUST drive the full walkthrough. No corner-cutting.

Code-reading degrade per `bootstrap.md` §4 applies ONLY when `browser` or `MCP` is unavailable. It is NOT a shortcut when both are available.

## 2. Tool tiering

The upstream Chrome DevTools MCP server ships 44 tools across 9 categories. This phase scopes the walkthroughs to a tiered subset; tools outside the tiers below are out of scope this version (see end of section).

### Tier 1 — mandatory in every UI-touching command body

`navigate_page`, `wait_for`, `take_snapshot`, `take_screenshot`, `list_console_messages`, `list_network_requests`, `evaluate_script`, `handle_dialog`.

These eight establish the minimal "open + observe + capture" loop. `handle_dialog` is included because any flow that triggers `alert` / `confirm` / `beforeunload` will hang or fabricate without a pre-registered handler.

### Tier 2 — mandatory when interactive surfaces are present

`click`, `fill`, `fill_form`, `press_key`, `hover`, `type_text`, `upload_file`, `drag`.

`hover` reveals tooltips, dropdowns, and hover-only state. `type_text` (real keyboard typing) surfaces `keypress` listener bugs that `fill` skips (autocomplete, IME). `upload_file` and `drag` cover historically under-tested flows (file uploads, drag-and-drop reorder, kanban, file drop).

### Tier 3 — mandatory for accessibility commands

Tier 1 + `lighthouse_audit` (with `categories: ["accessibility"]`) + `press_key` for focus traversal.

### Tier 4 — mandatory for performance commands

Tier 1 + `performance_start_trace` + `performance_stop_trace` + `performance_analyze_insight` + `emulate`.

### Tier 5 — mandatory for multi-tab flows (OAuth popups, "open in new tab")

`new_page`, `select_page`, `list_pages`, `close_page`. Optional unless the scenario carries `multiTab: true` or the flow opens an OAuth popup or a "view in new tab" link.

### Tier 6 — escape hatches (document but not mandatory)

`click_at` (pixel-coordinate click for canvas/SVG/custom inputs), `get_network_request` (single-request inspection: status code + payload + timing), `get_console_message` (single-message inspection).

### Out of scope this version

`take_memory_snapshot`, `get_memory_snapshot_details`, `get_nodes_by_class`, `load_memory_snapshot`, `screencast_start`, `screencast_stop`, extension tools (`install_extension`, `list_extensions`, `reload_extension`, `trigger_extension_action`, `uninstall_extension`), third-party tools (`execute_3p_developer_tool`, `list_3p_developer_tools`), WebMCP tools (`execute_webmcp_tool`, `list_webmcp_tools`).

## 3. Walkthrough Patterns

Pseudocode below uses Chrome DevTools MCP tool names verbatim. Each pattern is the canonical body that the named UI-touching command MUST drive when `browser` AND `MCP` are available.

### 3.1 Component-discovery walkthrough (explore-ui)

Use this when mapping the UI surface route-by-route: routes, components, forms, modals, ARIA basics, responsive breakpoints. Output goes to `_testatlas/12_app_map.json` plus `_testatlas/evidence/explore-ui/<ts>/<route-slug>/`.

```text
read app-map.json -> filter user-facing routes
for each route:
  navigate_page(url)
  wait_for({ selector: "[data-route-ready], main, #root", timeoutMs: 5000 })
  snapshot = take_snapshot()                               # accessibility tree
  take_screenshot({ format: "png", fullPage: true }) -> evidence/<route>/initial.png
  console_pre = list_console_messages()
  network_pre = list_network_requests()
  components = evaluate_script(() =>
    Array.from(document.querySelectorAll("[data-testid], [role], main *"))
      .map(el => ({ tag: el.tagName, role: el.getAttribute("role"), testid: el.dataset.testid }))
  )
  for breakpoint in [{w:375,h:812}, {w:768,h:1024}, {w:1280,h:800}]:
    resize_page(breakpoint)
    take_screenshot({ fullPage: true }) -> evidence/<route>/responsive/<bp>.png
  persist: snapshot.json, components.json, console.log.txt, network.json
  add route entry to app-map.json citing the evidence paths above
```

**Skip rationale:** if `wait_for` times out, mark the route `confidence: needs-validation` with `tool_unavailable` if the timeout is structural (no MCP available); otherwise log as a finding. Record the skip rationale on the route entry.

### 3.2 State-coverage walkthrough (explore-ui + test-domain `state` mode)

Use this when capturing the five PRD §13.1 lifecycle states (empty / loading / error / success / permission) for every interactive surface on a route. The matrix in §4 below is the contract; this pseudocode is the implementation.

```text
for each route:
  for each interactive surface (form|modal|menu|search|filter):
    # Empty
    navigate_page(url)
    wait_for(settle)
    take_screenshot -> evidence/<route>/<surface>/empty.png
    take_snapshot   -> evidence/<route>/<surface>/empty.json

    # Loading — induced via slow network
    emulate({ networkConditions: "Slow 3G" })
    navigate_page(url)
    take_screenshot (BEFORE wait_for completes) -> evidence/<route>/<surface>/loading.png
    wait_for(settle)
    emulate({ networkConditions: "No throttling" })

    # Error — induced by invalid input or fail-injection script
    if surface is form:
      fill_form({ ...invalid_payload })
      click(submitSelector)
      wait_for({ selector: ".error, [role=alert]", timeoutMs: 3000 })
      take_screenshot -> evidence/<route>/<surface>/error.png
      list_console_messages -> evidence/<route>/<surface>/error.console.log.txt
    else:
      # induce a fetch failure
      evaluate_script(() => { window.fetch = () => Promise.reject(new Error("induced")); })
      trigger surface (click button etc.)
      wait_for(error indicator)
      take_screenshot -> evidence/<route>/<surface>/error.png

    # Success — happy path
    navigate_page(url)
    fill_form({ ...valid_payload })
    click(submitSelector)
    wait_for({ selector: ".success, [data-success]" })
    take_screenshot -> evidence/<route>/<surface>/success.png
    take_snapshot   -> evidence/<route>/<surface>/success.json

    # Permission — log out + revisit, OR strip session cookie + navigate
    evaluate_script(() => document.cookie.split(";").forEach(c =>
      document.cookie = c.split("=")[0] + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
    ))
    navigate_page(url)
    wait_for(settle)
    take_screenshot -> evidence/<route>/<surface>/permission.png
    record observed status (302→login | 401 | 403 | render)

  # Dialog handling — covers alert/confirm/beforeunload
  handle_dialog({ accept: false })   # register dismiss handler before any action that might open one
```

**Skip rationale:** record on the route/component entry the rationale for any state legitimately absent (e.g., a static marketing page has no loading state because no fetch occurs). Skipping without rationale = contract violation.

### 3.3 Interactive-surface walkthrough (test-flow + test-domain)

Use this when exercising forms (validation matrix), modals (open + tab-trap + ESC dismiss), and link/keyboard navigation. `handle_dialog` MUST be pre-registered before any action that might surface an `alert` / `confirm` / `beforeunload`.

```text
# Forms — multi-field with validation matrix
fill_form({ fields: [
  { name: "email", value: "invalid" },
  { name: "password", value: "" },
])
click("[type=submit]")
wait_for({ selector: "[role=alert]", timeoutMs: 2000 })
errors = evaluate_script(() => Array.from(document.querySelectorAll("[role=alert]")).map(e => e.textContent))
take_screenshot -> evidence/<scenario>/form-validation.png
assert errors.length > 0 AND errors[0].matches(/email|invalid/)

# Then valid path
fill_form({ fields: [{name:"email",value:"a@b.test"},{name:"password",value:"correct horse battery"}] })
click("[type=submit]")

# Modals — open + tab-trap + ESC dismiss
click(openModalSelector)
wait_for({ selector: "[role=dialog]" })
take_snapshot    # snapshot focus state
take_screenshot  # visual
focusOrder = []
for i in 0..20:
  press_key("Tab")
  el = evaluate_script(() => document.activeElement.outerHTML.slice(0, 200))
  focusOrder.push(el)
  if focusOrder.length > 1 AND focusOrder[focusOrder.length-1] == focusOrder[0]:
    break  # tab trap confirmed
press_key("Escape")
wait_for(modal closed)

# Navigation — all internal links should be reachable
links = evaluate_script(() => Array.from(document.querySelectorAll("a[href^='/']")).map(a => a.href))
for href in links sample(min(10, len(links))):
  navigate_page(href)
  wait_for(settle)
  status = list_network_requests().filter(r => r.url == href)[0].status
  assert status < 400
  navigate_page(start_url)  # return

# Keyboard paths — Skip-to-content, focus order
navigate_page(url)
press_key("Tab")
firstFocused = evaluate_script(() => document.activeElement.outerHTML)
assert firstFocused contains "skip" OR is the first interactive element
```

**Skip rationale:** record on the scenario entry when a surface legitimately lacks an interactive element (e.g., a read-only detail page has no form). Tab-trap MAY be skipped on routes with no modal, but the rationale must be recorded.

### 3.4 A11y walkthrough (explore-accessibility + test-accessibility)

Use this when running PRD §13.9 accessibility audits: Lighthouse a11y category, ARIA inventory, focus-order traversal, contrast samples, dynamic-feedback diff.

```text
for each route:
  navigate_page(url)
  wait_for(settle)
  audit = lighthouse_audit({ categories: ["accessibility"] })
  persist audit -> evidence/<route>/lighthouse.json
  # PRD §13.9 thresholds
  assert audit.score >= 0.90
  assert audit.violations.filter(v => v.impact === "critical").length === 0

  # ARIA inventory — every interactive element must have an accessible name
  aria = evaluate_script(() =>
    Array.from(document.querySelectorAll("button, a, input, [role=button], [role=link]"))
      .map(el => ({
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
        name: el.ariaLabel || el.textContent?.trim() || el.title || "",
        tag: el.tagName,
        outer: el.outerHTML.slice(0, 200)
      }))
  )
  persist aria -> evidence/<route>/aria-inventory.json
  unlabeled = aria.filter(a => !a.name)
  assert unlabeled.length === 0  # PRD §13.9 input/button/icon labels

  # Focus order via Tab traversal
  focusTrail = []
  press_key("Tab")  # first stop
  for i in 0..50:
    el = evaluate_script(() => ({
      role: document.activeElement.getAttribute("role"),
      tag: document.activeElement.tagName,
      label: document.activeElement.ariaLabel || document.activeElement.textContent?.trim().slice(0,80),
      visible: document.activeElement.offsetWidth > 0 && document.activeElement.offsetHeight > 0
    }))
    focusTrail.push(el)
    take_screenshot -> evidence/<route>/focus-trail/step-<i>.png
    press_key("Tab")
    if focusTrail.length > 1 AND el === focusTrail[0]:
      break  # cycle complete
  persist focusTrail -> evidence/<route>/focus-order.json
  assert all(el.visible for el in focusTrail)  # PRD §13.9 focus state

  # Contrast samples
  samples = evaluate_script(() => {
    const targets = ["h1","h2","p","a","button","label","input"];
    return targets.flatMap(sel => Array.from(document.querySelectorAll(sel)).slice(0,3).map(el => {
      const cs = getComputedStyle(el);
      return { sel, color: cs.color, bg: cs.backgroundColor, font: cs.fontSize, weight: cs.fontWeight };
    }));
  })
  persist samples -> evidence/<route>/contrast-samples.json

  # Dynamic feedback (live regions, toasts, route-change focus)
  pre_snap = take_snapshot()
  trigger action that fires a toast (varies — refer scenario)
  wait_for({ selector: "[role=status], [aria-live]" })
  post_snap = take_snapshot()
  diff = post_snap.regions("aria-live").minus(pre_snap.regions("aria-live"))
  persist diff -> evidence/<route>/dynamic-feedback/diff.json
  assert diff.length > 0  # PRD §13.9 dynamic status feedback
```

**Skip rationale:** if `lighthouse_audit` returns an error after one retry, record the error and degrade to the inventory + focus-order + contrast subsections only — do not synthesize a Lighthouse score from training-data priors.

### 3.5 Performance walkthrough (explore-performance + test-performance)

Use this when running PRD §13.10 performance audits. Run two passes per route — baseline (no throttling) and throttled (CPU 4× + Slow 3G) — and capture trace + insights + network + snapshot for each.

```text
# Two passes: baseline + throttled
for each route in selected_set:
  for pass in ["baseline", "throttled"]:
    if pass == "throttled":
      emulate({ cpuThrottlingRate: 4, networkConditions: "Slow 3G" })
    else:
      emulate({ cpuThrottlingRate: 1, networkConditions: "No throttling" })

    navigate_page(url)
    wait_for({ selector: "main, #root" })
    performance_start_trace({ reload: true, autoStop: false })

    # Exercise primary interaction so INP can be measured
    if route has primary form:
      click(primarySelector)
      type_text(primaryField, "test input")
      click(submitSelector)
    else if route has primary action:
      click(primaryActionSelector)
      wait_for({ networkIdleMs: 500 })

    trace = performance_stop_trace()
    persist trace -> evidence/<route>/<pass>.trace.json

    insights = performance_analyze_insight({ trace })
    persist insights -> evidence/<route>/<pass>.insights.json
    network = list_network_requests()
    persist network -> evidence/<route>/<pass>.network.json
    take_snapshot -> evidence/<route>/<pass>.snapshot.json
    take_screenshot -> evidence/<route>/<pass>.png

    # PRD §13.10 thresholds
    assert insights.LCP <= 2500          # ms
    assert insights.INP <= 200           # ms
    assert insights.CLS <= 0.1
    assert insights.totalBlockingTime <= 300
    assert network.filter(r => r.retryCount > 0).length === 0
    assert insights.longTasks.filter(t => t.duration > 50).length <= K  # K from scenario
```

**Skip rationale:** if `performance_start_trace` errors after one retry, record the error and skip the route; do not invent trace numbers. The throttled pass MAY be skipped only when `emulate` is unsupported by the adapter — record `tool_unavailable: emulate` on the run record.

## 4. State-Coverage Matrix

Five PRD §13.1 states × triggering technique × evidence to capture × pass criterion. This matrix is the contract that pattern §3.2 implements.

| State | Triggering technique (Chrome DevTools MCP) | Evidence to capture | Pass criterion |
|-------|--------------------------------------------|----------------------|----------------|
| **empty** | `navigate_page(url)` while authenticated as a fresh user (no data) — OR script `evaluate_script(() => localStorage.clear())` then reload | `take_screenshot` (full page), `take_snapshot`, copy of any empty-state CTA / illustration, network requests confirming 0-row response | Empty-state copy is actionable (next-step CTA visible); not a vague "Nothing to show" |
| **loading** | `emulate({ networkConditions: "Slow 3G" })` then `navigate_page(url)`; `take_screenshot` BEFORE `wait_for` resolves; OR `evaluate_script(() => { const f = window.fetch; window.fetch = (...a) => new Promise(r => setTimeout(() => r(f(...a)), 3000)); })` | Mid-flight screenshot, snapshot showing skeleton/spinner, network log showing pending requests | Loading indicator present (skeleton, spinner, progress bar); aria-busy="true" or role="progressbar" on a live region |
| **error** | For forms: `fill_form` with invalid input + `click(submit)`. For data fetches: `evaluate_script(() => { window.fetch = () => Promise.reject(new Error("induced")); })` then trigger refetch. For 4xx/5xx: navigate to a non-existent resource. `handle_dialog({ accept: false })` if the app shows a confirm. | `take_screenshot` of error UI, `list_console_messages` (extract uncaught + warnings), error message text via `evaluate_script(() => document.querySelector('[role=alert]')?.textContent)`, `list_network_requests` showing the failing request | Error message is actionable (names what went wrong + recovery path); no stack trace in user-visible UI (PRD §17 critical rule); aria-live region announced the error |
| **success** | Happy path: `fill_form` valid + submit, OR `click(primaryAction)`, then `wait_for({ selector: "[data-success], .success, [role=status]" })` | `take_screenshot`, `take_snapshot`, success message text, network log confirming 2xx response | Success indicator is visible AND focus moved appropriately AND state persists across reload (test by reloading + re-checking) |
| **permission** | `evaluate_script(() => document.cookie.split(';').forEach(c => document.cookie = c.split('=')[0]+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'))` then `navigate_page(url)`. OR sign in as a role lacking permission (per scenario). | `take_screenshot`, observed status code from `list_network_requests` (302/401/403), redirect target URL, denied-message text | Either redirected to login OR 403/permission UI rendered with explicit reason; NOT a generic "something went wrong"; never leaks data partially before denying |

**Skip rules:** record on the route/component entry the rationale for any state legitimately absent (e.g., a static marketing page has no loading state because no fetch occurs). Skipping without rationale = contract violation. The state-coverage matrix is the canonical contract — every interactive surface that legitimately can reach a state MUST have evidence for that state.

## 5. Evidence Persistence (Strategy A — existing enum reuse)

Per the Phase 13 planner's locked decision (**Strategy A — no schema change**), all walkthrough artifacts map to existing `evidenceType` enum values defined in `.testatlas/schemas/vocabulary.schema.json` (`$defs/evidenceType`). The `description` field on the evidence record carries the discriminator (e.g., "Lighthouse accessibility audit JSON", "ARIA inventory dump", "Slow-3G mid-flight loading screenshot"). Do NOT introduce new enum values from this phase.

| Walkthrough artifact | evidenceType (existing enum) | Description-field guidance |
|----------------------|------------------------------|----------------------------|
| Per-state screenshot (empty / loading / error / success / permission) | `screenshot` | Include state name + surface name (e.g., "loading state — login form, mid-flight under Slow 3G") |
| DOM accessibility tree (`take_snapshot` output) | `accessibility` | "DOM accessibility tree — `<route-slug>` initial render" |
| Lighthouse JSON (a11y category) | `accessibility` | "Lighthouse accessibility audit JSON — `categories: [accessibility]`" |
| Lighthouse JSON (perf category) | `performance` | "Lighthouse performance audit JSON — `categories: [performance]`" |
| Performance trace (`performance_start_trace` + `_stop_trace` output) | `performance` | "Performance trace — `<pass>` (baseline | throttled)" |
| Performance insights JSON (`performance_analyze_insight` output) | `performance` | "Performance insights — LCP / INP / CLS / TBT for `<route-slug>`" |
| Network log (`list_network_requests`) | `network` | "Network log — `<route-slug>` `<pass>`" |
| Console log (`list_console_messages`) | `console` | "Console log — `<route-slug>` `<state>`" |
| ARIA inventory (interactive elements + accessible names) | `accessibility` | "ARIA inventory dump — interactive elements + accessible names" |
| Focus-order trail (sequential Tab traversal) | `accessibility` | "Focus-order trail — Tab traversal sequence" |
| Contrast samples (computed-style snapshot) | `accessibility` | "Contrast samples — computed color / bg / font for `<targets>`" |
| Dialog handler log (`handle_dialog` invocation record) | `log` | "Dialog handler log — alert/confirm/beforeunload events" |

**Path discipline:** evidence file paths nest under `_testatlas/evidence/<command>/<timestamp>/<route-slug>/[<surface>/]<state>.<ext>`. The schema's `path` field is path-freeform (`type: string, minLength: 1`) — no schema change needed for the deeper nesting introduced by walkthrough artifacts. PRD TEST-03 redaction discipline still applies: strip secrets, tokens, PII before persisting.

## 6. Sources

- `prd/prd.md` §13.1 (UI states), §13.9 (a11y), §13.10 (perf), §17 (no stack traces), §18 (evidence), §26 (test-type catalog), §40 (lifecycle)
- upstream `chrome-devtools-mcp` `tool-reference.md` (44 tools / 9 categories — verified 2026-05-06)
- `.testatlas/bootstrap.md` §4 (capability degradation), §8 (no-evidence-no-finding), §12 (explorer standards), §14
- `.testatlas/reference/capabilities.md` (per-capability action matrix)
- `.testatlas/reference/severity.md`, `.testatlas/reference/confidence.md`
- `.planning/phases/13-chrome-devtools-mcp-ui-walkthrough-coverage/13-RESEARCH.md` (toolset audit, walkthrough patterns, mandatory-when-available contract, state-coverage matrix, evidence schema fit)

---

*Update cadence: this file is updated by suite releases via `update.js`; not by routine command execution.*
