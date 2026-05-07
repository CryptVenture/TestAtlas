---
command: council-design-critique
version: 2.0.0
mode: design-critique
description: Design Critique — Product Strategist, User Advocate, and Accessibility Reviewer critique a UI flow's user experience, copy, navigation, and a11y through the 9-round protocol.
capabilities: [shell, browser, file-write]
produces:
  - command-result
  - council-session
consumes:
  - flow
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify product code or copy. Does NOT click destructive UI controls. Read-only over `_testatlas/`; persona browser walkthroughs follow the Phase 13 walkthrough discipline.
---

# TestAtlas Command (V2 council): council-design-critique

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Read `.testatlas/reference/council-protocol.md` for the full 9-round protocol.
4. Read `.testatlas/reference/chrome-devtools-mcp.md` — UI walkthrough discipline.
5. Read `.testatlas/agents/registry.md` for the persona slate.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Run a Design Critique (PRD §7.9) when UI flows are mapped, product copy or navigation matters, or onboarding/activation/conversion flows are critical. Product Strategist, User Advocate, and Accessibility Reviewer (and optionally a Visual Designer project persona) critique the experience: clarity, friction, microcopy, navigation, accessibility, responsive behavior. Output: prioritized critique with proposed fixes.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/reference/chrome-devtools-mcp.md` — Tier-1 UI walkthrough toolset.
- `.testatlas/agents/registry.md`
- Target flow's `_testatlas/flows/<slug>/flow.{md,json}` plus the relevant entries in `_testatlas/maps/{routes,pages,components,states}.json`
- Existing UI evidence under `_testatlas/evidence/explore-ui/` and `_testatlas/evidence/explore-accessibility/`

## Participant Selection

Recommended slate: Product Strategist, User Advocate, Accessibility Reviewer. Optionally add a Visual Designer project persona (`_testatlas/agents/personas/project/`) where the repo defines one.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the flow's UI evidence.
2. **Independent review.** Each persona drives a UI walkthrough per `chrome-devtools-mcp.md` (when browser+MCP capabilities present) and captures findings.
3. **Initial findings.** Personas emit `message_type: "finding"` referencing screenshots / DOM snapshots.
4. **Cross-questioning.** Personas challenge each other's interpretation (e.g., "is this confusing copy or appropriately concise?").
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas may request additional walkthrough captures.
7. **Vote.** Per critique motion (e.g., "this copy needs revision", "this flow needs a clearer success state"), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts the critique narrative in `consolidation.{md,json}`.
9. **Canonical updates.** Run `node scripts/consolidate-council.js --session-id <id>`.

## Setup

```sh
node scripts/create-council-session.js \
  --topic "Design critique: <flow-id>" \
  --mode design-critique \
  --participants product-strategist,user-advocate,accessibility-reviewer
```

Run `node scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (critique narrative)
2. Accepted critiques
3. Rejected critiques
4. Disputed critiques
5. Issue candidates (UX issues with severity + screenshot)
6. Test candidates (proposed UX regression scenarios)
7. Open questions
8. Required evidence
9. Updates made (flow doc proposed updates)
10. Next recommended command

## Stop Conditions

- Target flow not specified → halt with question.
- No UI evidence captured AND browser+MCP capabilities unavailable → halt: "Run `/atlas:explore ui` first or grant browser+MCP."
- Fewer than 2 participants → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Each accepted critique cites a screenshot or DOM snapshot.
- `followups.md` lists actionable design changes.
- Lifecycle close entries written.

## What's Next

- `/atlas:test flow <flow-id>` to validate any proposed regression scenarios.
- `/atlas:report` to surface UX/A11y findings in the next quality report.
- Project-side: route critiques to design / engineering.
