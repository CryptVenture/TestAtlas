---
description: Release readiness council — personas weigh blockers, coverage, drift, and council consensus into a documented go / conditional / no-go decision through the 9-round protocol.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-release-readiness.md" hash="a23fc29d6497157c6cdb3f1e25e1ef6a2723d7055a2a7ef1d26fb628364ef464" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-council-release-readiness.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Release Readiness council (PRD §7.9) to weigh blockers, coverage, drift, and council consensus into a documented go / conditional / no-go decision. The Release Readiness Judge owns the final summary; QA Lead, Security and Privacy Reviewer, and Documentation Curator audit the inputs. Output: an evidence-backed decision with explicit blockers, conditional concerns, and rollback plan.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/issues.json`, `_testatlas/brain/coverage.json`, `_testatlas/brain/drift.json`, `_testatlas/brain/quality_scores.json`
- The latest `_testatlas/reports/REPORT-release-readiness-*.md` if present
- `CHANGELOG.md` `[Unreleased]` section

## Participant Selection

Recommended slate: Release Readiness Judge, QA Lead, Security and Privacy Reviewer, Documentation Curator. Add Performance Skeptic if recent perf regressions are tracked; add Adversarial Red Team Tester to challenge a "go" recommendation when consensus seems thin.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + brain JSON snapshot.
2. **Independent review.** Personas evaluate gates against the project's release criteria.
3. **Initial findings.** Personas emit `message_type: "finding"` with their gate-by-gate verdict.
4. **Cross-questioning.** Personas challenge gate evaluations.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas may request `node .testatlas/scripts/explore-tests.js --refresh` (deterministic runner-detection + test-inventory accelerator) or run `/atlas:explore-tests` (full agent-driven coverage + flake + gap analysis) to refresh test coverage signals before voting.
7. **Vote.** Per gate motion AND on the final go / conditional / no-go, +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** The Release Readiness Judge drafts the final decision in `consolidation.{md,json}` with explicit blockers, conditional concerns, and rollback plan.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>` and `node .testatlas/scripts/generate-report.js --kind release-readiness --report-path=_testatlas/reports/REPORT-release-readiness-<ts>.md`.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Release readiness for v<version>" \
  --mode release-readiness \
  --participants release-readiness-judge,qa-lead,security-privacy-reviewer,documentation-curator
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary — go / conditional / no-go with rationale
2. Accepted gates passed
3. Rejected gates
4. Disputed concerns
5. Issue candidates (release-blocking issues newly surfaced)
6. Test candidates (smoke + regression coverage gaps)
7. Open questions
8. Required evidence
9. Updates made
10. Next recommended command

## Stop Conditions

- `_testatlas/brain/` not initialized → halt: "Run `/atlas:init --mode upgrade` first."
- Final decision is `no-go` AND human override requested → halt and escalate.
- Required gate inputs missing (issues.json, coverage.json) → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Decision recorded with explicit blocker list in `consolidation.json.decision`.
- `_testatlas/reports/REPORT-release-readiness-<ts>.md` regenerated.
- `_testatlas/brain/decisions.json` updated with the go / conditional / no-go entry.
- Lifecycle close entries written.

## What's Next

- `/atlas:report` for the full quality report.
- If go: human-driven `node .testatlas/scripts/bump-version.js` (this command does not auto-bump).
- If no-go: `/atlas:triage` on blockers and re-run this council after remediation.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
