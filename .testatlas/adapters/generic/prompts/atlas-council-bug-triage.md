<!-- TestAtlas command: atlas-council-bug-triage. Paste .testatlas/bootstrap.md first; description: Bug triage council — multiple personas classify and prioritize open issues by severity, priority, and remediation sequencing through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-bug-triage.md" hash="b542f492de90bf8fa0206d5b8dc15bec2e1667e0bbabaf4a6eeea955e103693a" -->
First read `.testatlas/bootstrap.md`. Then read `prompts/atlas-council-bug-triage.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Bug Triage Council (PRD §7.9) when many issues exist, severity is unclear, or remediation sequencing is needed. Multiple personas classify each issue by severity, priority, and remediation cost; surface duplicates and consolidate where evidence overlaps. Output: a triaged issue list with assigned severity, priority, and recommended next-action per issue.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/issues.json`
- All open issues under `_testatlas/to_fix/` (filter by `status: open` for the in-scope batch)
- Any retest pack referenced by the issues

## Participant Selection

Recommended slate: QA Lead, Security and Privacy Reviewer, Performance Skeptic, Release Readiness Judge. Add User Advocate when issues are user-facing; add Data Steward for data-corruption issues.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the issue batch.
2. **Independent review.** Each persona drafts a severity + priority assessment per issue.
3. **Initial findings.** Personas emit `message_type: "finding"` per issue.
4. **Cross-questioning.** Personas challenge severity/priority assignments via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with the relevant PRD §12.5 type — most commonly: factual, severity, priority, evidence-sufficiency, expected-behavior, safety, implementation-interpretation, product-strategy.
6. **Rebuttal or evidence request.** Posted via `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per issue motion (severity assignment, priority assignment, dedupe proposal), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with the agreed severity, priority, and remediation order per issue.
9. **Canonical updates.** Run `node scripts/consolidate-council.js --session-id <id>`. Issue severity/priority updates are recorded as proposed canonical updates; humans apply them via `/atlas:triage` follow-up if `safe_mode` is enabled.

## Setup

```sh
node scripts/create-council-session.js \
  --topic "Bug triage: <batch-name>" \
  --mode bug-triage \
  --participants qa-lead,security-privacy-reviewer,performance-skeptic,release-readiness-judge
```

Run `node scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (severity/priority distribution)
2. Accepted classifications (per-issue severity + priority)
3. Rejected classifications
4. Disputed issues (deferred to followups)
5. Issue candidates (newly surfaced during triage)
6. Test candidates (retest-pack proposals)
7. Open questions
8. Required evidence
9. Updates made
10. Next recommended command

## Stop Conditions

- Issue batch not specified → halt with question.
- Fewer than 2 participants → halt.
- Issues outside the in-scope batch referenced → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Each in-scope issue carries an accepted severity + priority OR is in disputed.
- `followups.md` lists actionable next steps per issue.
- Lifecycle close entries written.

## What's Next

- `/atlas:triage` to apply accepted severity/priority updates.
- `/atlas:retest issue <id>` for any issue marked `fixed_pending_retest` during triage.
- `/atlas:report` to refresh the quality report with new triage state.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
