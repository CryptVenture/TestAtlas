---
name: atlas-council-product-review
description: Debate-mode council on product priority, feature coherence, and tradeoffs — personas argue for/against a conclusion through the 9-round protocol.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-product-review.md" hash="e0d4fa4b1d1918d18b061fafacbe4fafe1916c0e8abf6876dc48f7fba5a61d94" -->
First read `.testatlas/bootstrap.md`. Then read `.kiro/skills/atlas-council-product-review.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Debate (PRD §7.9) on a product question — feature priority, expected behavior ambiguity, severity dispute, or release readiness when the answer is unclear. Personas argue for and against the proposition; the orchestrator forces evidence on every claim. Output: a documented decision (or escalation to human) with accepted, rejected, and disputed claims.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/01_product_intent.md`
- Any artifact directly under debate (issue, flow, domain, RFC)

## Participant Selection

Recommended slate: Product Strategist, QA Lead, User Advocate, Adversarial Red Team Tester. Add Security and Privacy Reviewer for any debate touching auth or sensitive data.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + `prompt.md` + `context_bundle.md`.
2. **Independent review.** Personas form initial positions without seeing others.
3. **Initial findings.** Personas emit `message_type: "finding"` transcript lines stating their position with evidence.
4. **Cross-questioning.** Personas pose `message_type: "question"` to challenge each other.
5. **Disagreement capture.** Persistent conflicts recorded in `disagreements.md` with the PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per motion, +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with accepted / rejected / disputed claims.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Product debate: <question>" \
  --mode debate \
  --participants product-strategist,qa-lead,user-advocate,adversarial-red-team-tester
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary
2. Accepted claims
3. Rejected claims
4. Disputed claims (escalated to human if priority > medium)
5. Issue candidates
6. Test candidates
7. Open questions
8. Required evidence
9. Updates made
10. Next recommended command

## Stop Conditions

- Debate question not specified → halt.
- Fewer than 2 participants → halt.
- Disputed claims remain after consolidation AND priority is `critical` → escalate to human (`generated_questions.md`).

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled.
- `followups.md` written.
- Lifecycle close entries written.

## What's Next

- If decision is "ship": `/atlas:report` to fold into the next quality report.
- If decision is "defer": `/atlas:retest issue <id>` once new evidence lands.
- If escalated: human review per `generated_questions.md`.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
