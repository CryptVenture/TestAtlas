---
description: Summarize the current TestAtlas workspace — phase, counts, blockers, stale areas — by reading the V2 brain state.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/status.md" hash="c369638158a975f40dd0c37cd3ef0166ebc7872fb6cc70573e20aa37bd37c227" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-core-status.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Render a concise, evidence-backed status report of the V2 brain so the next agent can pick up without prior context. Pulls phase, counts, blockers, stale domains, and next-recommended commands directly from `state.json` — never invents.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/state.json`
- `_testatlas/brain/manifest.json`
- `_testatlas/brain/issues.json`
- `_testatlas/brain/coverage.json`

## Required Actions

1. Load `_testatlas/brain/state.json`. If missing → halt with `Run /atlas:init first.`
2. Print:
   - Project name + active environment
   - Current phase + last command + last updated timestamp
   - Counts (domains, flows, issues, critical_issues, high_issues, evidence_artifacts, council_sessions)
   - Confidence (overall + highest_risk_domains + stale_domains)
   - `next_recommended_commands` array
3. Cross-reference `issues.json` and surface up to 5 critical-or-high open issues.
4. If `coverage.json` shows 0 routes/components/endpoints/commands, flag low-coverage as a gap.
5. Close the lifecycle (next section).

## Allowed Tools

- filesystem (read on `_testatlas/`)
- file-write (only the lifecycle close + post-operation brain update)

## Capability Degradation

This command requires only `file-write`. No degradation needed.

## Outputs

- A markdown status block printed to the agent transcript.
- Lifecycle close entries (status, artifact-index, command-log, manifest, run-log).

## Stop Conditions

- `_testatlas/brain/state.json` missing → halt.
- Brain validation reports findings → mention them in the status report; do not auto-fix.

## Completion Criteria

- A status block exists in the agent transcript.
- The 5 lifecycle artifacts updated.
- An `EVENT-N` of type `command_completed` is appended to `_testatlas/brain/events.jsonl`.

## Post-Operation Brain Update

After the status block is rendered, call `node scripts/update-brain-after-command.js --command status --actor agent --summary "Status reported." --status completed`. This appends a `command_completed` event to `events.jsonl`, bumps `state.status.last_command`, and refreshes `state.status.last_updated` — automating the post-operation brain update so no manual JSON edit is needed.

## What's Next

- `/atlas:brain-validate` — verify brain integrity if anything looked off.
- `/atlas:explore` — start mapping the product if domains/flows are empty.
- `/atlas:report` — produce a full report when counts are non-zero.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
