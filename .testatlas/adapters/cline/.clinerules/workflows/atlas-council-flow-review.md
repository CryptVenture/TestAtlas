<!-- TestAtlas command: atlas-council-flow-review. Invoke as /atlas-council-flow-review.md. Description: Roundtable review of a single user flow — personas read the flow doc, route map, evidence, and run logs and contribute findings, claims, and disagreements through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-flow-review.md" hash="83b3d8cf358d7993637d5c5b99d1ee481abdbde2d0fa5f15591c37f64ea35e1b" -->
First read `.testatlas/bootstrap.md`. Then read `.clinerules/workflows/atlas-council-flow-review.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Roundtable Review (PRD §7.9) on a single user flow. Personas examine the flow's coverage, friction points, error-recovery paths, accessibility, and performance posture. Output: an evidence-backed evaluation of the flow's quality with accepted, rejected, and disputed claims plus prioritized followups.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/flows.json`
- The target flow's `_testatlas/flows/FLOW-<slug>.{md,json}`
- The flow's evidence directory under `_testatlas/evidence/`

## Participant Selection

Recommended slate: User Advocate, QA Lead, Performance Skeptic, Accessibility Reviewer. Add Security and Privacy Reviewer for auth/payment flows; add API Contract Analyst for flows with backend interactions.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` allow-list + `prompt.md` + `context_bundle.md`.
2. **Independent review.** Personas examine the flow without seeing other findings.
3. **Initial findings.** Each persona emits `message_type: "finding"` transcript lines.
4. **Cross-questioning.** Personas pose questions via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with one of the 8 PRD §12.5 types (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas post `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per motion, +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with accepted / rejected / disputed claims.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`.

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

- **objective:** "Produce <persona-id>'s independent flow-walkthrough findings on the user flow under review."
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

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`roundtable-review`), target flow, participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated `_testatlas/domains/<domain>/flows/<flow>/flow.{md,json}` artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`roundtable-review` / flow `<flow>`) — `<n>` participants / `<n>` rounds / `<n>` flow findings / `<n>` accepted canonical updates; consolidation proposes updates to the flow artifacts."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-flow-review --actor agent --summary "Ran Flow Review Council on <flow> and produced canonical-update proposals" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled.
- `followups.md` written; `_testatlas/brain/agent_sessions.json` updated.
- Lifecycle close entries written.

## What's Next


- **`/atlas:log-issue`** — for every accepted issue candidate with severity `medium` or higher, invoke `/atlas:log-issue` to create a tracked issue under `_testatlas/to_fix/`. Link the issue back to the council session ID in its `history` array. Rejected candidates do not need to be logged.

- `/atlas:test-flow` to validate council-proposed test scenarios.
- `/atlas:report` to refresh the quality report.
- If new issue candidates were generated, run `/atlas:triage` to prioritize.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
