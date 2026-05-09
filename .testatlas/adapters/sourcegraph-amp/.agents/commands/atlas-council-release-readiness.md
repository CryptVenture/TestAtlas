<!-- TestAtlas command: atlas-council-release-readiness. Invoke as /atlas-council-release-readiness. Description: Release readiness council — personas weigh blockers, coverage, drift, and council consensus into a documented go / conditional / no-go decision through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-release-readiness.md" hash="c5355352d2bc918cd2cc04ee3baa12d91f65b7c95b985e807125683db54c6e07" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-council-release-readiness.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Release Readiness council (PRD §7.9) to weigh blockers, coverage, drift, and council consensus into a documented go / conditional / no-go decision. The Release Readiness Judge owns the final summary; QA Lead, Security and Privacy Reviewer, and Documentation Curator audit the inputs. Output: an evidence-backed decision with explicit blockers, conditional concerns, and rollback plan.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
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
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas may request `node .testatlas/scripts/explore-tests.js --refresh` (deterministic runner-detection + test-inventory accelerator) or run `/atlas:explore-tests` (full agent-driven coverage + flake + gap analysis) to refresh test coverage signals before voting.
7. **Vote.** Per gate motion AND on the final go / conditional / no-go, +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** The Release Readiness Judge drafts the final decision in `consolidation.{md,json}` with explicit blockers, conditional concerns, and rollback plan.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>` and `node .testatlas/scripts/generate-report.js --kind release-readiness --report-path=_testatlas/reports/REPORT-release-readiness-<ts>.md`.

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

- **objective:** "Produce <persona-id>'s independent release-readiness findings on the release candidate."
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

- `_testatlas/brain/` not initialized → halt: "Run `/atlas:core-init --mode upgrade` first."
- Final decision is `no-go` AND human override requested → halt and escalate.
- Required gate inputs missing (issues.json, coverage.json) → halt.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`release-readiness`), participants, completion state, the go/no-go decision, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated readiness / report artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`release-readiness`) — `<n>` participants / `<n>` rounds / decision `<go|no-go>` / `<n>` gate failures / `<n>` blockers; consolidation proposes release notes and outstanding-blocker dispositions."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-release-readiness --actor agent --summary "Ran Release Readiness Council and produced go/no-go decision + blocker dispositions" --status completed --reindex`.

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
