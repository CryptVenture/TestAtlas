---
name: atlas-council-test-plan
description: Test Plan Council — QA, automation, codebase, data, and runtime personas propose a complete testing plan through the 9-round protocol.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-test-plan.md" hash="eaad4bc3d3c921e7ac624c23bee9e9ee3105b94ab904027e9cb029eaca41a2d2" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-council-test-plan.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Test Plan Council (PRD §7.9) when planning a major test run, onboarding a new repo, or preparing CI automation. QA Lead, Automation Engineer, Codebase Mapper, Data Steward, and Runtime Investigator collaborate on layered coverage (unit, contract, integration, E2E), fixture strategy, smoke-test design, and CI integration. Output: a documented test plan with prioritized scenarios, fixture proposals, and automation candidates.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, interpretation, priority, scope, evidence_sufficiency, risk_assessment, safety, implementation_interpretation, expected_behavior, product_strategy — snake_case union per `.testatlas/schemas/vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/coverage.json`, `_testatlas/brain/flows.json`
- `_testatlas/02_test_strategy.md` (if present)
- `_testatlas/explorers/tests/tests_explorer.json` (if present)
- `_testatlas/maps/{routes,components,endpoints,jobs,cli-commands,integrations}.json` — read each file IF PRESENT (the `_testatlas/maps/` directory is empty in fresh / pre-explore workspaces; treat any missing file as a tolerant skip rather than a halt, and surface the gap as a coverage-gap input to the council).

## Participant Selection

Recommended slate: QA Lead (lead), Automation Engineer, Codebase Mapper, Data Steward, Runtime Investigator. Add Performance Skeptic for performance-critical features; add Security and Privacy Reviewer for auth/payment flows.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the coverage ledger + recent test runs.
2. **Independent review.** Each persona drafts its layer's coverage proposal: unit (Codebase Mapper), contract (API Contract Analyst if present), integration (Runtime Investigator + Data Steward), E2E (Automation Engineer + QA Lead).
3. **Initial findings.** Personas emit `message_type: "finding"` with their layer plan.
4. **Cross-questioning.** Personas challenge layer boundaries (e.g., "this should be unit, not E2E") via `message_type: "question"`.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type from `vocabulary.schema.json#/$defs/disagreement_type`: factual, interpretation, priority, scope, evidence_sufficiency, risk_assessment, safety, implementation_interpretation, expected_behavior, product_strategy.
6. **Rebuttal or evidence request.** Personas may request a fresh `node .testatlas/scripts/update-coverage.js --category all` run before voting.
7. **Vote.** Per scenario motion (include / exclude / move-to-different-layer), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. **Vote-scale mapping:** the numeric values `+2`, `+1`, `0`, `-1`, `-2` map 1:1 to the schema enum `vote_value` (per `vocabulary.schema.json#/$defs/vote_value`) values `strong_yes`, `yes`, `abstain`, `no`, `strong_no` respectively. Both representations are first-class: `votes.json` persists schema-enum tokens; transcripts and disagreement narratives may use either form. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** QA Lead drafts the test plan in `consolidation.{md,json}`. Automation Engineer drafts the automation candidates list.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. The plan lands as `_testatlas/02_test_strategy.md` proposed updates.

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

- **objective:** "Produce <persona-id>'s independent test-plan findings on the test-plan under review."
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

### After Spawn Round Completes — Record Execution Mode

After the spawn round (rounds 2-3) finishes, the orchestrator MUST record how the spawn actually executed. This closes the audit-honesty contract from Phase-21 (HIGH-1: orchestrator records executionMode post-hoc when both args undefined) and consumes the Phase-22 DEC-006 producer.

Run this command, substituting the actual session id and detected execution mode:

```sh
node .testatlas/scripts/record-execution-mode.js \
  --session-id <COUNCIL-YYYY-MM-DD-NNN> \
  --mode <parallel-subagents|single-spawn-inline|sequential-fallback|classify-only|inline-simulation|no-op> \
  --justification "<short host/runtime context note>"
```

The valid `--mode` values are the six members of the `executionMode` enum in `council_session.schema.json`. If the host is unable to spawn sub-agents (e.g., concatenated-conventions adapter — see `.testatlas/reference/capabilities.md` § Concatenated-Conventions Adapter Limitations), record `inline-simulation`. Idempotent — safe to re-run.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Test plan: <scope>" \
  --mode test-plan \
  --participants qa-lead,automation-engineer,codebase-mapper,data-steward,runtime-investigator
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §7.8 / §12.7)

The Test Plan Council produces all 15 PRD §7.8 council-session artifacts inside `_testatlas/agents/councils/sessions/<session-id>/`:

1. `summary.md` — final summary (test plan narrative)
2. `accepted.md` — accepted scenarios (per layer)
3. `rejected.md` — rejected scenarios
4. `disputed.md` — disputed scenarios
5. `generated_issues.md` — issue candidates (gaps surfaced during planning)
6. `test_candidates.md` — test candidates (the plan itself, layered: unit / contract / integration / E2E)
7. `generated_questions.md` — open questions (e.g., fixture realism unknowns)
8. `followups.md` — required evidence (e.g., production-shape data samples)
9. `consolidation.md` + `consolidation.json` — consolidated test plan (QA Lead draft) with `canonical_updates` block targeting `_testatlas/02_test_strategy.md`
10. `next_command.md` — next recommended command line
11. `transcript.md` (or `transcript-<persona-id>.md` per persona) — per-persona round-by-round messages emitted during the 9-round protocol (`finding`, `critique`, `rebuttal`, `vote`, `consolidation`, `question`, `evidence_request`)
12. `disagreements.md` — disagreements captured in round 5 with PRD §12.5 disagreement_type from `vocabulary.schema.json#/$defs/disagreement_type`
13. `votes.json` — round-7 votes per motion on the +2 / -2 scale (per `vocabulary.schema.json#/$defs/vote_value`)
14. `claims.jsonl` — extracted claims index (JSONL append-only event stream, per `.testatlas/scripts/extract-claims.js:129`) produced by `node .testatlas/scripts/extract-claims.js --session-id <id>`
15. `session.json` — schema-validated council session sidecar (validates against `council_session.schema.json`); brain delta also written under `_testatlas/brain/council-deltas/<session-id>.json` and the dispatch-log row appended at `_testatlas/agents/councils/sessions/dispatch-log.md`

## Stop Conditions

- Scope not specified → halt with question.
- `_testatlas/brain/coverage.json` missing → halt: "Run `/atlas:explore` first to establish a baseline."
- Fewer than 2 participants → halt.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`test-plan`), participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/` plus the proposed updates to `_testatlas/02_test_strategy.md`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated `02_test_strategy.md` must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`test-plan`) — `<n>` participants / `<n>` rounds / `<n>` accepted scenarios / `<n>` rejected / `<n>` disputed; consolidation proposes `02_test_strategy.md` updates."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-test-plan --actor agent --summary "Ran Test Plan Council and produced layered test plan + automation candidates" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Test plan written with per-layer scenario lists.
- Automation candidates list with estimated runtime + maintenance cost.
- Lifecycle close entries written.

## What's Next


- **`/atlas:log-issue`** — for every accepted issue candidate with severity `medium` or higher, invoke `/atlas:log-issue` to create a tracked issue under `_testatlas/to_fix/`. Link the issue back to the council session ID in its `history` array. Rejected candidates do not need to be logged.

- `/atlas:test-generate-scenarios` to materialize accepted scenarios.
- `/atlas:test-generate-automation` to scaffold automation skeletons.
- `/atlas:test-critical-flows` once scenarios exist.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
