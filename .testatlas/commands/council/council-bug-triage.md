---
command: council-bug-triage
version: 2.0.0
mode: bug-triage
description: Bug triage council — multiple personas classify and prioritize open issues by severity, priority, and remediation sequencing through the 9-round protocol.
capabilities: [shell, file-write, subagent-spawn, council-orchestration, persona-context, brain-sync]
produces:
  - command-result
  - council-session
consumes:
  - issue
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify issue files directly during the council. Does NOT close issues. Read-only over `_testatlas/to_fix/` plus the session folder.
---

# TestAtlas Command (V2 council): council-bug-triage

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Read `.testatlas/reference/council-protocol.md` for the full 9-round protocol.
4. Read `.testatlas/agents/registry.md` for the persona slate.
5. Inspect `_testatlas/brain/state.json` and `_testatlas/brain/issues.json`.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Run a Bug Triage Council (PRD §7.9) when many issues exist, severity is unclear, or remediation sequencing is needed. Multiple personas classify each issue by severity, priority, and remediation cost; surface duplicates and consolidate where evidence overlaps. Output: a triaged issue list with assigned severity, priority, and recommended next-action per issue.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
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
5. **Disagreement capture.** Recorded in `disagreements.md` with the relevant PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`) — most commonly: factual, risk_assessment, priority, evidence_sufficiency, expected_behavior, safety, implementation_interpretation, product_strategy.
6. **Rebuttal or evidence request.** Posted via `message_type: "rebuttal"` or `message_type: "evidence_request"`.
7. **Vote.** Per issue motion (severity assignment, priority assignment, dedupe proposal), +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with the agreed severity, priority, and remediation order per issue.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. Issue severity/priority updates are recorded as proposed canonical updates; humans apply them via `/atlas:triage` follow-up if `safe_mode` is enabled.

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

- **objective:** "Produce <persona-id>'s independent bug-triage findings on the issues under triage."
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
  --topic "Bug triage: <batch-name>" \
  --mode bug-triage \
  --participants qa-lead,security-privacy-reviewer,performance-skeptic,release-readiness-judge
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

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

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`bug-triage`), participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated issue artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`bug-triage`) — `<n>` participants / `<n>` rounds / `<n>` issues triaged / `<n>` re-prioritized / `<n>` deferred; consolidation proposes updates to `_testatlas/issues/*.md`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-bug-triage --actor agent --summary "Ran Bug Triage Council and produced prioritized issue dispositions" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Each in-scope issue carries an accepted severity + priority OR is in disputed.
- `followups.md` lists actionable next steps per issue.
- Lifecycle close entries written.

## What's Next

- `/atlas:triage` to apply accepted severity/priority updates.
- `/atlas:retest issue <id>` for any issue marked `fixed_pending_retest` during triage.
- `/atlas:report` to refresh the quality report with new triage state.
