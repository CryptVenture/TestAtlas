<!-- TestAtlas command: atlas-council-brain-audit. Invoke as /prompts:atlas-council-brain-audit. Description: Brain Audit Council — personas inspect the _testatlas workspace for staleness, contradictions, missing updates, and bad structure through the 9-round protocol. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/council/council-brain-audit.md" hash="fc1901eeff2f9f7ae18b6e86ae5f643f90b5b6f632a1c1f0a22ce972c86aa218" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-council-brain-audit.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Run a Brain Audit Council (PRD §7.9) after large runs, before final reports, or after multiple agents have written outputs. Personas inspect `_testatlas/` for staleness, contradictions between markdown and JSON, missing updates, broken cross-references, and structural drift. Output: a list of audit findings with proposed canonical fixes and confidence-recalibration recommendations.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation — snake_case per `vocabulary.schema.json#/$defs/disagreement_type`), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/manifest.json`, `_testatlas/brain/drift.json`
- `_testatlas/09_artifact_index.md`, `_testatlas/00_overview.md`
- Output of `node .testatlas/scripts/validate-brain.js` and `node .testatlas/scripts/sync-markdown-json.js --dry-run`

## Participant Selection

Recommended slate: Documentation Curator (lead), Codebase Mapper, Adversarial Red Team Tester. Add QA Lead when audit scope includes test coverage drift; add Runtime Investigator for environment/observability drift.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the validate-brain + sync-markdown-json reports.
2. **Independent review.** Each persona surfaces 3-5 audit findings (drift, contradictions, missing artifacts, broken references).
3. **Initial findings.** Personas emit `message_type: "finding"` per audit observation.
4. **Cross-questioning.** Personas challenge each other's audit interpretations.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type (snake_case per `vocabulary.schema.json#/$defs/disagreement_type`): factual, expected_behavior, risk_assessment, priority, evidence_sufficiency, product_strategy, safety, implementation_interpretation.
6. **Rebuttal or evidence request.** Personas may request a fresh `validate-brain.js` run before voting.
7. **Vote.** Per finding, vote on severity (drift, contradiction, missing) and proposed fix. +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with the audit narrative + canonical-update proposals.
9. **Canonical updates.** Run `node .testatlas/scripts/consolidate-council.js --session-id <id>`. Approved drift records update `_testatlas/brain/drift.json`.

## Setup

```sh
node .testatlas/scripts/create-council-session.js \
  --topic "Brain audit: <reason>" \
  --mode brain-audit \
  --participants documentation-curator,codebase-mapper,adversarial-red-team-tester
```

Run `node .testatlas/scripts/extract-claims.js --session-id <id>` after round 3.

## Outputs (PRD §12.7)

1. Final summary (audit verdict + drift counts)
2. Accepted findings (drift records, contradictions confirmed)
3. Rejected findings
4. Disputed findings
5. Issue candidates (audit findings that warrant tracking as issues)
6. Test candidates (drift-detection tests)
7. Open questions
8. Required evidence
9. Updates made (`_testatlas/brain/drift.json`, `_testatlas/09_artifact_index.md`)
10. Next recommended command

## Stop Conditions

- `_testatlas/brain/` not initialized → halt: "Run `/atlas:core-init --mode upgrade` first."
- `validate-brain.js` reports unrecoverable schema violations → halt; resolve those first.
- Fewer than 2 participants → halt.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record session id, mode (`brain-audit`), participants, completion state, and pointers to the session folder under `_testatlas/agents/councils/sessions/<session-id>/`.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (the new session folder and any updated drift artifacts must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing this council session id.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. (Council session counts live in V2 brain state — see the `council_sessions` field of `_testatlas/brain/state.json`'s `counts` object — and are reconciled by the brain-update hook below; the V1 manifest's `counts.*` keys remain `domains`, `flows`, `issues`, `evidenceRecords`, `testRuns`, `reports` only.)
- `_testatlas/history/run_log.md` — narrative entry: "COUNCIL-`<session-id>` (`brain-audit`) — `<n>` participants / `<n>` rounds / `<n>` drift records / `<n>` contradictions / `<n>` missing-update findings; consolidation proposes updates to `_testatlas/brain/drift.json`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command council-brain-audit --actor agent --summary "Ran Brain Audit Council and produced drift / contradiction / missing-update findings" --status completed --reindex`.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Drift records updated in `_testatlas/brain/drift.json`.
- `_testatlas/09_artifact_index.md` re-derived from disk if any cross-references broke.
- Lifecycle close entries written.

## What's Next

- `/atlas:core-brain-validate` to confirm post-audit brain integrity.
- `/atlas:core-brain-sync` to apply markdown↔JSON sync fixes.
- If many drift findings, schedule `/atlas:council-retest` for affected issues.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
