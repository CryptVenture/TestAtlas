---
command: council-test-plan
version: 2.0.0
mode: test-plan
description: Test Plan Council — QA, automation, codebase, data, and runtime personas propose a complete testing plan through the 9-round protocol.
capabilities: [shell, file-write]
produces:
  - command-result
  - council-session
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT execute tests. Does NOT modify CI config. Read-only over `_testatlas/` plus the session folder.
---

# TestAtlas Command (V2 council): council-test-plan

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Read `.testatlas/reference/council-protocol.md` for the full 9-round protocol.
4. Read `.testatlas/agents/registry.md` for the persona slate.
5. Inspect `_testatlas/brain/state.json`, `_testatlas/brain/coverage.json`, `_testatlas/02_test_strategy.md`.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Run a Test Plan Council (PRD §7.9) when planning a major test run, onboarding a new repo, or preparing CI automation. QA Lead, Automation Engineer, Codebase Mapper, Data Steward, and Runtime Investigator collaborate on layered coverage (unit, contract, integration, E2E), fixture strategy, smoke-test design, and CI integration. Output: a documented test plan with prioritized scenarios, fixture proposals, and automation candidates.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, interpretation, priority, scope, evidence_sufficiency, risk_assessment, safety, implementation_interpretation, expected_behavior, product_strategy — snake_case union per `.testatlas/schemas/vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
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
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type from `vocabulary.schema.json#/$defs/disagreement_type`: factual, interpretation, priority, scope, evidence_sufficiency, risk_assessment, safety, implementation_interpretation, expected_behavior, product_strategy.
6. **Rebuttal or evidence request.** Personas may request a fresh `node .testatlas/scripts/update-coverage.js --category all` run before voting.
7. **Vote.** Per scenario motion (include / exclude / move-to-different-layer), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** QA Lead drafts the test plan in `consolidation.{md,json}`. Automation Engineer drafts the automation candidates list.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. The plan lands as `_testatlas/02_test_strategy.md` proposed updates.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Test plan: <scope>" \
  --mode test-plan \
  --participants qa-lead,automation-engineer,codebase-mapper,data-steward,runtime-investigator
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §7.8 / §12.7)

The Test Plan Council produces all 15 PRD §7.8 council-session artifacts inside `_testatlas/agents/councils/sessions/<session-id>/`:

1. `summary.md` — final summary (test plan narrative)
2. `accepted.md` — accepted scenarios (per layer)
3. `rejected.md` — rejected scenarios
4. `disputed.md` — disputed scenarios
5. `generated_issues.md` — issue candidates (gaps surfaced during planning)
6. `test_candidates.md` — test candidates (the plan itself, layered: unit / contract / integration / E2E)
7. `generated_questions.md` — open questions (e.g., fixture realism unknowns)
8. `followups.md` — required evidence (e.g., production-shape data samples)
9. `consolidation.md` + `consolidation.json` — consolidated test plan (QA Lead draft) with `canonical_updates` block targeting `_testatlas/02_test_strategy.md`
10. `next_command.md` — next recommended command line
11. `transcript.md` (or `transcript-<persona-id>.md` per persona) — per-persona round-by-round messages emitted during the 9-round protocol (`finding`, `critique`, `rebuttal`, `vote`, `consolidation`, `question`, `evidence_request`)
12. `disagreements.md` — disagreements captured in round 5 with PRD §12.5 disagreement_type from `vocabulary.schema.json#/$defs/disagreement_type`
13. `votes.json` — round-7 votes per motion on the +2 / -2 scale (per `vocabulary.schema.json#/$defs/vote_value`)
14. `claims.json` — extracted claims index produced by `node .testatlas/scripts/extract-claims.js --session-id <id>`
15. `session.json` — schema-validated council session sidecar (validates against `council-session.schema.json`); brain delta also written under `_testatlas/brain/council-deltas/<session-id>.json` and the dispatch-log row appended at `_testatlas/agents/councils/sessions/dispatch-log.md`

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

- `/atlas:test-generate-scenarios` to materialize accepted scenarios.
- `/atlas:test-generate-automation` to scaffold automation skeletons.
- `/atlas:test-critical-flows` once scenarios exist.
