<!-- TestAtlas command: atlas-council-retest. Invoke as /atlas-council-retest. Description: Retest council — personas evaluate whether a claimed fix satisfies the issue's acceptance criteria through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-retest.md" hash="3a43ad428da20464c7a7f82d882fcb958a9292597acdfb84e04d6014a1b9a0c2" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-council-retest.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Retest Council (PRD §7.9) when an issue is marked `fixed_pending_retest` or when release readiness depends on a fix landing. Personas evaluate whether the fix satisfies the issue's acceptance criteria, whether the retest pack reproduces the original failure on the pre-fix commit, and whether the fix introduces new risks. Output: a verdict (passed | failed | needs-more-evidence) with rationale.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- The target `_testatlas/to_fix/<issue-id>/issue.{md,json}`
- The retest pack at `_testatlas/tests/retest_packs/<issue-id>/`
- The new evidence captured by the retest run (`_testatlas/evidence/retest/<issue-id>/<timestamp>/`)

## Participant Selection

Recommended slate: QA Lead (lead), Automation Engineer, Adversarial Red Team Tester. Add Security and Privacy Reviewer when the original issue was a security finding; add the persona who originally surfaced the issue (`discoveredByPersona` from issue.json).

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the original issue + the retest pack + the new evidence.
2. **Independent review.** Each persona evaluates: does the new evidence demonstrate the fix? does it cover all acceptance criteria? are there regressions?
3. **Initial findings.** Personas emit `message_type: "finding"` with verdict per acceptance criterion.
4. **Cross-questioning.** Personas challenge each other's interpretation of the evidence.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, evidence_sufficiency, expected_behavior, risk_assessment, priority, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas may request additional retest runs (`/atlas:retest issue <id>`).
7. **Vote.** On the overall verdict (passed / failed / needs-more-evidence), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** QA Lead drafts the verdict in `consolidation.{md,json}`.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. If verdict is `passed`, the issue's status updates to `closed_verified`; if `failed`, status updates to `regression_confirmed`.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Retest: <issue-id>" \
  --mode retest \
  --participants qa-lead,automation-engineer,adversarial-red-team-tester
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (verdict + rationale)
2. Accepted (acceptance criteria confirmed)
3. Rejected (criteria not met)
4. Disputed (criteria where evidence is ambiguous)
5. Issue candidates (regressions surfaced)
6. Test candidates (extensions to the retest pack)
7. Open questions
8. Required evidence
9. Updates made (issue status update)
10. Next recommended command

## Stop Conditions

- Issue id not specified → halt with question.
- Issue not in `fixed_pending_retest` status → halt: "Issue must be marked fixed before retesting."
- Retest pack missing → halt: "Run `/atlas:test-generate-retest-pack --issue-id <id>` first."
- Fewer than 2 participants → halt.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`retest`), target issue id, participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and the updated `_testatlas/issues/<id>.md` artifact must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`retest` / issue `<id>`) — `<n>` participants / `<n>` rounds / verdict `<verified|reopened>`; consolidation proposes the issue-status transition."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-retest --actor agent --summary "Ran Retest Council on issue <id> and produced verified/reopened verdict" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Issue status update recorded in `consolidation.json.canonical_updates`.
- Lifecycle close entries written.

## What's Next

- If `passed`: `/atlas:report` to fold the closure into the next quality report.
- If `failed`: `/atlas:triage` to re-prioritize and re-scope the fix.
- If `needs-more-evidence`: re-run `/atlas:retest issue <id>` with the requested evidence.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
