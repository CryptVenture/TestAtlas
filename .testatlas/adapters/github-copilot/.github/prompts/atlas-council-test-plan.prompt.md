---
mode: agent
description: Test Plan Council — QA, automation, codebase, data, and runtime personas propose a complete testing plan through the 9-round protocol.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-test-plan.md" hash="38cbdfa5acda3afe0796ebd6b4ec1798fefed5ecd501b56310e2a1fcd9e31a2f" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Test Plan Council (PRD §7.9) when planning a major test run, onboarding a new repo, or preparing CI automation. QA Lead, Automation Engineer, Codebase Mapper, Data Steward, and Runtime Investigator collaborate on layered coverage (unit, contract, integration, E2E), fixture strategy, smoke-test design, and CI integration. Output: a documented test plan with prioritized scenarios, fixture proposals, and automation candidates.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/coverage.json`, `_testatlas/brain/flows.json`
- `_testatlas/02_test_strategy.md` (if present)
- `_testatlas/explorers/tests/tests_explorer.json` (if present)
- `_testatlas/maps/{routes,components,endpoints,jobs,cli_commands,integrations}.json`

## Participant Selection

Recommended slate: QA Lead (lead), Automation Engineer, Codebase Mapper, Data Steward, Runtime Investigator. Add Performance Skeptic for performance-critical features; add Security and Privacy Reviewer for auth/payment flows.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the coverage ledger + recent test runs.
2. **Independent review.** Each persona drafts its layer's coverage proposal: unit (Codebase Mapper), contract (API Contract Analyst if present), integration (Runtime Investigator + Data Steward), E2E (Automation Engineer + QA Lead).
3. **Initial findings.** Personas emit `message_type: "finding"` with their layer plan.
4. **Cross-questioning.** Personas challenge layer boundaries (e.g., "this should be unit, not E2E") via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas may request a fresh `node scripts/update-coverage.js --category all` run before voting.
7. **Vote.** Per scenario motion (include / exclude / move-to-different-layer), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** QA Lead drafts the test plan in `consolidation.{md,json}`. Automation Engineer drafts the automation candidates list.
9. **Canonical updates.** Run `node scripts/consolidate-council.js --session-id <id>`. The plan lands as `_testatlas/02_test_strategy.md` proposed updates.

## Setup

```sh
node scripts/create-council-session.js \
  --topic "Test plan: <scope>" \
  --mode test-plan \
  --participants qa-lead,automation-engineer,codebase-mapper,data-steward,runtime-investigator
```

Run `node scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (test plan narrative)
2. Accepted scenarios (per layer)
3. Rejected scenarios
4. Disputed scenarios
5. Issue candidates (gaps surfaced during planning)
6. Test candidates (the plan itself)
7. Open questions (e.g., fixture realism unknowns)
8. Required evidence (e.g., production-shape data samples)
9. Updates made (`_testatlas/02_test_strategy.md` proposed updates)
10. Next recommended command

## Stop Conditions

- Scope not specified → halt with question.
- `_testatlas/brain/coverage.json` missing → halt: "Run `/atlas:explore` first to establish a baseline."
- Fewer than 2 participants → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Test plan written with per-layer scenario lists.
- Automation candidates list with estimated runtime + maintenance cost.
- Lifecycle close entries written.

## What's Next

- `/atlas:generate scenarios` to materialize accepted scenarios.
- `/atlas:generate automation` to scaffold automation skeletons.
- `/atlas:test critical-flows` once scenarios exist.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
