---
command: council-brain-audit
version: 2.0.0
mode: brain-audit
description: Brain Audit Council — personas inspect the _testatlas workspace for staleness, contradictions, missing updates, and bad structure through the 9-round protocol.
capabilities: [file-write]
produces:
  - command-result
  - council-session
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify canonical artifacts during the council — only consolidation may consolidate findings into `_testatlas/`. Read-only over the workspace plus the session folder.
---

# TestAtlas Command (V2 council): council-brain-audit

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Read `.testatlas/reference/council-protocol.md` for the full 9-round protocol.
4. Read `.testatlas/agents/registry.md` for the persona slate.
5. Inspect `_testatlas/brain/state.json`, `_testatlas/brain/manifest.json`, `_testatlas/brain/drift.json`.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Run a Brain Audit Council (PRD §7.9) after large runs, before final reports, or after multiple agents have written outputs. Personas inspect `_testatlas/` for staleness, contradictions between markdown and JSON, missing updates, broken cross-references, and structural drift. Output: a list of audit findings with proposed canonical fixes and confidence-recalibration recommendations.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/reference/council-protocol.md` — 9-round protocol, disagreement classification (factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation), voting scale, council outputs.
- `.testatlas/agents/registry.md`
- `_testatlas/brain/state.json`, `_testatlas/brain/manifest.json`, `_testatlas/brain/drift.json`
- `_testatlas/09_artifact_index.md`, `_testatlas/00_overview.md`
- Output of `node scripts/validate-brain.js` and `node scripts/sync-markdown-json.js --check`

## Participant Selection

Recommended slate: Documentation Curator (lead), Codebase Mapper, Adversarial Red Team Tester. Add QA Lead when audit scope includes test coverage drift; add Runtime Investigator for environment/observability drift.

## Required Actions (9-Round Protocol)

1. **Context read.** Each persona reads its `read_first` + the validate-brain + sync-markdown-json reports.
2. **Independent review.** Each persona surfaces 3-5 audit findings (drift, contradictions, missing artifacts, broken references).
3. **Initial findings.** Personas emit `message_type: "finding"` per audit observation.
4. **Cross-questioning.** Personas challenge each other's audit interpretations.
5. **Disagreement capture.** Recorded in `disagreements.md` with the PRD §12.5 type: factual, expected-behavior, severity, priority, evidence-sufficiency, product-strategy, safety, implementation-interpretation.
6. **Rebuttal or evidence request.** Personas may request a fresh `validate-brain.js` run before voting.
7. **Vote.** Per finding, vote on severity (drift, contradiction, missing) and proposed fix. +2 / -2 scale: `+2 strongly agree`, `+1 agree`, `0 abstain`, `-1 disagree`, `-2 strongly disagree`. Final consolidation MUST NOT follow majority if evidence contradicts.
8. **Consolidation.** Documentation Curator drafts `consolidation.{md,json}` with the audit narrative + canonical-update proposals.
9. **Canonical updates.** Run `node scripts/consolidate-council.js --session-id <id>`. Approved drift records update `_testatlas/brain/drift.json`.

## Setup

```sh
node scripts/create-council-session.js \
  --topic "Brain audit: <reason>" \
  --mode brain-audit \
  --participants documentation-curator,codebase-mapper,adversarial-red-team-tester
```

Run `node scripts/extract-claims.js --session-id <id>` after round 3.

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

- `_testatlas/brain/` not initialized → halt: "Run `/atlas:init --mode upgrade` first."
- `validate-brain.js` reports unrecoverable schema violations → halt; resolve those first.
- Fewer than 2 participants → halt.

## Completion Criteria

- Session folder contains all 15 PRD §7.8 artifacts.
- Drift records updated in `_testatlas/brain/drift.json`.
- `_testatlas/09_artifact_index.md` re-derived from disk if any cross-references broke.
- Lifecycle close entries written.

## What's Next

- `/atlas:brain-validate` to confirm post-audit brain integrity.
- `/atlas:brain-sync` to apply markdown↔JSON sync fixes.
- If many drift findings, schedule `/atlas:council retest` for affected issues.
