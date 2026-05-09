---
name: atlas-council-red-team
description: Red Team Challenge — adversarial personas attempt to find hidden risks and invalidate confident claims through the 9-round protocol.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-red-team.md" hash="e9b42c3b9ddd81b900658c4683b5dc217aa555ade8c0b52a523e72af6fea02d2" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-council-red-team.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Red Team Challenge (PRD §7.9) to attack the brain's most confident claims, surface hidden failure modes, and probe abuse paths. Useful when confidence is high but evidence is thin, when security/privacy/UX trust matters, or when launch readiness is being assessed. Output: invalidated claims, newly surfaced risks, and a recalibrated confidence map.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
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
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`) — most commonly: factual, evidence_sufficiency, expected_behavior, risk_assessment, priority, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per claim under attack, vote on whether it should be re-classified (stay accepted, downgrade to disputed, mark invalidated). +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}`; Red Team Tester writes the recalibration narrative.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. Invalidated claims update `_testatlas/brain/claims.jsonl` status to `invalidated` or `disputed`.

## Sub-Agent Orchestration

This council command is a per-persona spawn-and-aggregate orchestrator. When the host declares the
`subagent-spawn` capability (per `bootstrap.md` Capability Degradation, the 18-adapter matrix at
bootstrap.md lines 70-89), the command spawns ONE sub-agent per declared participant for rounds
2 and 3 (Independent review + Initial findings) and aggregates their structured findings into the
session transcript. Per the per-round orchestration table in `.testatlas/reference/council-protocol.md`
§7, rounds 1, 4, 5, 6, 7, 8, and 9 run inline; only rounds 2 and 3 spawn. Specifically, round 2 (Independent review) and round 3 (Initial findings) are the two per-persona spawn rounds.

The applicable child task pool is the `participants` array recorded in `session.json` (3-7 personas
typical), with each child reading the persona's own `read_first` allow-list from
`_testatlas/agents/personas/<type>/<persona-id>.json` rather than the full transcript.

**Per-child brief contract** (placeholder `<persona-id>` stands for each declared participant):

- **objective:** "Produce <persona-id>'s independent red-team findings on the threat model under review."
- **scope:** "Reading allowed: prompt.md, context_bundle.md, the persona's own read_first
  allow-list, and the in-scope target artifact(s). Reading other personas' outputs is forbidden
  during this spawn — independence is the cognitive contract for rounds 2-3."
- **files-to-read:** "_testatlas/agents/councils/sessions/<session-id>/{prompt.md,context_bundle.md},
  _testatlas/agents/personas/<type>/<persona-id>.json (read the read_first array and follow each
  path), and the council-protocol reference shard at .testatlas/reference/council-protocol.md."
- **output-format:** "Markdown to outputs/<persona-id>-output.md (free-form structured findings)
  PLUS JSON to outputs/<persona-id>-output.json ({findings:[{id,title,evidence_refs[],severity,confidence,disagreement_seed?}]})
  PLUS transcript.jsonl appends (one line per finding) with message_type:'finding', speaker:<persona-id>."
- **may-write:** "ONLY outputs/<persona-id>-output.{md,json} and transcript.jsonl appends. The
  persona's may_update allow-list applies post-consolidation (round 9 via consolidate-council.js),
  NOT during this spawn. No canonical doc writes during the spawn."
- **exit-criteria:** "Persona's outputs/<persona-id>-output.{md,json} written; ≥1 finding emitted
  to transcript.jsonl with the persona's speaker id; persona's blind_spots acknowledged in the
  markdown output's preamble."

**Aggregation.** After all spawned children complete, the orchestrator merges their transcript
appends, then runs `node .testatlas/scripts/extract-claims.js` to materialize claims.jsonl from
the merged transcript. Rounds 4-9 then run inline in the orchestrator's context with full
visibility of every persona's outputs/ artifact.

**Failure.** If any spawned child fails to produce its outputs/<persona-id>-output.{md,json}
pair, mark `executionMode: 'sequential-fallback'` in `session.json` and re-run the failed
persona's round 2-3 inline as a recovery. The threshold guard below applies.

**Capability degradation.** Mark the run record `executionMode` per the 6-mode enum:
- `parallel-subagents` — host has `subagent-spawn` AND participants.length ≥ 2 AND all spawns succeeded.
- `single-spawn-inline` — host has `subagent-spawn` AND participants.length === 1 (degenerate; spawn anyway).
- `sequential-fallback` — host has `subagent-spawn` BUT one or more spawns failed and personas ran serially.
- `classify-only` — topic was classified but participants.length === 0; no rounds executed.
- `inline-simulation` — host LACKS `subagent-spawn`; one process role-plays N personas inline (the
  pre-Phase-21 default; backward-compatible for adapters in the 9-row no-spawn matrix in bootstrap.md).
- `no-op` — host has `subagent-spawn` but the threshold guard below tripped.

**Threshold guard.** If `participants.length < 2` after filtering, run all 9 rounds inline
regardless of host capability (degenerate single-spawn = wasted overhead). Record
`executionMode: 'single-spawn-inline'` (when 1 participant) or `'no-op'` (when 0).

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Red team: <scope>" \
  --mode red-team \
  --participants adversarial-red-team-tester,security-privacy-reviewer,qa-lead
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

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

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`red-team`), scope, participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated risk-register / issue artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`red-team` / scope `<scope>`) — `<n>` participants / `<n>` rounds / `<n>` claims attacked / `<n>` weakened / `<n>` overturned; consolidation proposes risk-register and issue updates."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-red-team --actor agent --summary "Ran Red Team Council on <scope> and produced risk-register / issue updates" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Claim status updates recorded in `consolidation.json.canonical_updates`.
- `_testatlas/brain/risks.json` updated with any new risks.
- Lifecycle close entries written.

## What's Next

- `/atlas:retest issue <id>` for any newly invalidated claim that maps to an issue.
- `/atlas:report` to surface the recalibrated confidence map.
- `/atlas:council-brain-audit` if many claims were invalidated (likely systemic doc drift).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
