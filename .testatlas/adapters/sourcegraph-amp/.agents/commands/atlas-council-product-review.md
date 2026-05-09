<!-- TestAtlas command: atlas-council-product-review. Invoke as /atlas-council-product-review. Description: Debate-mode council on product priority, feature coherence, and tradeoffs — personas argue for/against a conclusion through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-product-review.md" hash="6e0bf46db93cb3a29e738e65d5cbbf3cb847a6ef9ba506ab5ffa28e2e17c995c" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-council-product-review.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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

- **objective:** "Produce <persona-id>'s independent product-review findings on the product slice under review."
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

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`debate`), debate question, participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`debate` / `<debate-question-slug>`) — `<n>` participants / `<n>` rounds / `<n>` accepted claims / `<n>` rejected / `<n>` disputed; consolidation produces a strategy memo for human review."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-product-review --actor agent --summary "Ran Product Review Council debate on <debate-question> and produced strategy memo" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled.
- `followups.md` written.
- Lifecycle close entries written.

## What's Next


- **`/atlas:log-issue`** — for every accepted issue candidate with severity `medium` or higher, invoke `/atlas:log-issue` to create a tracked issue under `_testatlas/to_fix/`. Link the issue back to the council session ID in its `history` array. Rejected candidates do not need to be logged.

- If decision is "ship": `/atlas:report` to fold into the next quality report.
- If decision is "defer": `/atlas:retest issue <id>` once new evidence lands.
- If escalated: human review per `generated_questions.md`.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
