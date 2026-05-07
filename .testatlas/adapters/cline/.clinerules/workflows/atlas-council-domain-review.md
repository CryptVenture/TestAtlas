<!-- TestAtlas command: atlas-council-domain-review. Invoke as /atlas-council-domain-review.md. Description: Roundtable review of a domain — every persona reads the domain's docs, evidence, and brain slice and contributes findings, claims, and disagreements through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-domain-review.md" hash="1a90d394757003f778a88a0f9e3ca83d480794ef38162ce0059911ca29e1d911" -->
First read `.testatlas/bootstrap.md`. Then read `.clinerules/workflows/atlas-council-domain-review.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Roundtable Review (PRD §7.9) on a single domain. Every selected persona reads the same context (domain docs + brain slice + evidence index + recent issues) and contributes findings independently. The council surfaces coverage gaps, contradictions, and consolidation candidates. Output: an evidence-backed picture of the domain's quality posture with accepted, rejected, and disputed claims.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9 rounds, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/domains.json`
- The target domain's `_testatlas/domains/<slug>/domain.{md,json}`
- Recent issues touching the domain (`_testatlas/brain/issues.json` filtered by `affected_domains`)

## Participant Selection

Recommended slate (per `council-protocol.md` §5): all available personas, weighted to the domain. Always include QA Lead and User Advocate; add Codebase Mapper for code-heavy domains, Data Steward for data-heavy domains, Security and Privacy Reviewer for auth/privacy domains.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` allow-list plus `prompt.md` + `context_bundle.md`.
2. **Independent review.** Each persona inspects domain artifacts without seeing other personas' findings.
3. **Initial findings.** Each persona writes to `outputs/<persona-id>-output.{md,json}` and emits `message_type: "finding"` transcript lines.
4. **Cross-questioning.** Personas pose questions via `message_type: "question"`.
5. **Disagreement capture.** Persistent conflicts recorded in `disagreements.md` with one of the 8 PRD §12.5 types: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** For each motion, each persona casts a vote on the +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with accepted / rejected / disputed claims.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>` to produce `followups.md` and update brain indexes.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Domain review: <domain-slug>" \
  --mode roundtable-review \
  --participants qa-lead,user-advocate,codebase-mapper,documentation-curator,adversarial-red-team-tester
```

Then run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3 to materialize claims.jsonl.

## Outputs (PRD §12.7)

Every council session produces:

1. Final summary (in `consolidation.md`)
2. Accepted claims
3. Rejected claims
4. Disputed claims (deferred to followups)
5. Issue candidates (in `generated_issues.md`)
6. Test candidates
7. Open questions (in `generated_questions.md`)
8. Required evidence (in `followups.md`)
9. Updates made (canonical writes recorded in `consolidation.json.canonical_updates`)
10. Next recommended command

## Stop Conditions

- Target domain not specified → halt with question.
- Target domain's `domain.{md,json}` missing → halt: "Run `/atlas:map-domains` first."
- Fewer than 2 participants → halt (a council requires multi-persona).
- Any persona's `may_update` deny-list violation detected during outputs → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled with accepted / rejected / disputed claim arrays.
- `followups.md` written.
- `_testatlas/brain/agent_sessions.json` updated to `status: completed`.
- Lifecycle close entries written.

## What's Next

- `/atlas:report` to refresh the latest quality report.
- `/atlas:brain-validate` to confirm consolidation produced valid brain state.
- If disputed claims remain, queue a `/atlas:council-red-team` to challenge them.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
