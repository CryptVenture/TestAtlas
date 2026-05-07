---
command: council-flow-review
version: 2.0.0
mode: roundtable-review
description: Roundtable review of a single user flow — personas read the flow doc, route map, evidence, and run logs and contribute findings, claims, and disagreements through the 9-round protocol.
capabilities: [shell, file-write]
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
boundary: Does NOT modify the flow artifact directly during the council. Does NOT trigger product behavior. Read-only over `_testatlas/`.
---

# TestAtlas Command (V2 council): council-flow-review

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Read `.testatlas/reference/council-protocol.md` for the full 9-round protocol.
4. Read `.testatlas/agents/registry.md` for the persona slate.
5. Inspect `_testatlas/brain/state.json` and the target flow's files.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Run a Roundtable Review (PRD §7.9) on a single user flow. Personas examine the flow's coverage, friction points, error-recovery paths, accessibility, and performance posture. Output: an evidence-backed evaluation of the flow's quality with accepted, rejected, and disputed claims plus prioritized followups.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/flows.json`
- The target flow's `_testatlas/flows/<slug>/flow.{md,json}`
- The flow's evidence directory under `_testatlas/evidence/`

## Participant Selection

Recommended slate: User Advocate, QA Lead, Performance Skeptic, Accessibility Reviewer. Add Security and Privacy Reviewer for auth/payment flows; add API Contract Analyst for flows with backend interactions.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` allow-list + `prompt.md` + `context_bundle.md`.
2. **Independent review.** Personas examine the flow without seeing other findings.
3. **Initial findings.** Each persona emits `message_type: "finding"` transcript lines.
4. **Cross-questioning.** Personas pose questions via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with one of the 8 PRD §12.5 types: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per motion, +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with accepted / rejected / disputed claims.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Flow review: <flow-id>" \
  --mode roundtable-review \
  --participants user-advocate,qa-lead,performance-skeptic,accessibility-reviewer,documentation-curator
```

Then run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary
2. Accepted claims
3. Rejected claims
4. Disputed claims
5. Issue candidates (`generated_issues.md`)
6. Test candidates
7. Open questions (`generated_questions.md`)
8. Required evidence (`followups.md`)
9. Updates made
10. Next recommended command

## Stop Conditions

- Target flow not specified → halt with question.
- Flow's `flow.{md,json}` missing → halt: "Run `/atlas:map-domains` and create the flow first."
- Fewer than 2 participants → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled.
- `followups.md` written; `_testatlas/brain/agent_sessions.json` updated.
- Lifecycle close entries written.

## What's Next

- `/atlas:test-flow` to validate council-proposed test scenarios.
- `/atlas:report` to refresh the quality report.
- If new issue candidates were generated, run `/atlas:triage` to prioritize.
