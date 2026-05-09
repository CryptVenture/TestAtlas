---
name: atlas-council-domain-review
description: Roundtable review of a domain — every persona reads the domain's docs, evidence, and brain slice and contributes findings, claims, and disagreements through the 9-round protocol.
inclusion: manual
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-domain-review.md" hash="8aef027be0c77febd24a980d7b58902720535cb6e3a7389076655b7609b81cc2" -->
First read `.testatlas/bootstrap.md`. Then read `.kiro/skills/atlas-council-domain-review.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Roundtable Review (PRD §7.9) on a single domain. Every selected persona reads the same context (domain docs + brain slice + evidence index + recent issues) and contributes findings independently. The council surfaces coverage gaps, contradictions, and consolidation candidates. Output: an evidence-backed picture of the domain's quality posture with accepted, rejected, and disputed claims.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9 rounds, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
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
5. **Disagreement capture.** Persistent conflicts recorded in `disagreements.md` with one of the 8 PRD §12.5 types (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation.
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

- **objective:** "Produce <persona-id>'s independent roundtable-review findings on the domain under review."
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

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`roundtable-review`), target domain, participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated `_testatlas/domains/<domain>/domain.{md,json}` artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`roundtable-review` / domain `<domain>`) — `<n>` participants / `<n>` rounds / `<n>` review findings / `<n>` accepted canonical updates; consolidation proposes updates to `_testatlas/domains/<domain>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-domain-review --actor agent --summary "Ran Domain Review Council on <domain> and produced canonical-update proposals" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- `consolidation.json` filled with accepted / rejected / disputed claim arrays.
- `followups.md` written.
- `_testatlas/brain/agent_sessions.json` updated to `status: completed`.
- Lifecycle close entries written.

## What's Next


- **`/atlas:log-issue`** — for every accepted issue candidate with severity `medium` or higher, invoke `/atlas:log-issue` to create a tracked issue under `_testatlas/to_fix/`. Link the issue back to the council session ID in its `history` array. Rejected candidates do not need to be logged.

- `/atlas:report` to refresh the latest quality report.
- `/atlas:core-brain-validate` to confirm consolidation produced valid brain state.
- If disputed claims remain, queue a `/atlas:council-red-team` to challenge them.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
