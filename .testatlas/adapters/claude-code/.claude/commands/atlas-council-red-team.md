---
description: Red Team Challenge — adversarial personas attempt to find hidden risks and invalidate confident claims through the 9-round protocol.
allowed-tools: Read, Write, Edit, Glob, Grep
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-red-team.md" hash="82dccfb42e4b27fd689e2c1430aaaf3778abe08615426719117b7095e792911d" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Red Team Challenge (PRD §7.9) to attack the brain's most confident claims, surface hidden failure modes, and probe abuse paths. Useful when confidence is high but evidence is thin, when security/privacy/UX trust matters, or when launch readiness is being assessed. Output: invalidated claims, newly surfaced risks, and a recalibrated confidence map.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/claims.jsonl`, `_testatlas/brain/quality_scores.json`
- The scope artifacts under attack (domain, flow, issue, or feature)
- `.testatlas/reference/safety.md` — destructive-action gates

## Participant Selection

Recommended slate: Adversarial Red Team Tester (lead), Security and Privacy Reviewer, QA Lead. Add Performance Skeptic when challenging perf claims; add Data Steward when challenging data-integrity claims.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the target's claims.jsonl excerpt.
2. **Independent review.** Each persona identifies the 3 claims it most distrusts and what would invalidate each.
3. **Initial findings.** Personas emit `message_type: "finding"` listing the targeted claims and proposed invalidation paths.
4. **Cross-questioning.** Personas challenge each other's invalidation logic via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type — most commonly: factual, evidence-sufficiency, expected-behavior, severity, priority, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per claim under attack, vote on whether it should be re-classified (stay accepted, downgrade to disputed, mark invalidated). +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}`; Red Team Tester writes the recalibration narrative.
9. **Canonical updates.** Run `node scripts/consolidate-council.js --session-id <id>`. Invalidated claims update `_testatlas/brain/claims.jsonl` status to `invalidated` or `disputed`.

## Setup

```sh
node scripts/create-council-session.js \
  --topic "Red team: <scope>" \
  --mode red-team \
  --participants adversarial-red-team-tester,security-privacy-reviewer,qa-lead
```

Run `node scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (which claims survived; which were invalidated)
2. Accepted (claims that survived attack)
3. Rejected (claims invalidated by evidence)
4. Disputed (claims now under-evidenced)
5. Issue candidates (newly surfaced abuse paths or hidden failures)
6. Test candidates (regression tests for invalidated claims)
7. Open questions
8. Required evidence
9. Updates made (claim status changes, risk register additions)
10. Next recommended command

## Stop Conditions

- Scope not specified → halt with question.
- Any persona attempts an exploit payload → halt; this command does NOT execute exploits.
- Fewer than 2 participants → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Claim status updates recorded in `consolidation.json.canonical_updates`.
- `_testatlas/brain/risks.json` updated with any new risks.
- Lifecycle close entries written.

## What's Next

- `/atlas:retest issue <id>` for any newly invalidated claim that maps to an issue.
- `/atlas:report` to surface the recalibrated confidence map.
- `/atlas:council brain-audit` if many claims were invalidated (likely systemic doc drift).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
