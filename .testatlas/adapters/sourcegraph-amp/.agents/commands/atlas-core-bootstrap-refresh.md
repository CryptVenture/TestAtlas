<!-- TestAtlas command: atlas-core-bootstrap-refresh. Invoke as /atlas-core-bootstrap-refresh. Description: Re-read the constitution, validate token budget, and refresh bootstrap shards so a long-running agent doesn't drift from the rules. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/bootstrap-refresh.md" hash="81806f1dae3b58f9c17b6d8d8e62bb9bb5943e4bdaa86ce3f26b2b2a186e9e03" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-core-bootstrap-refresh.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Refresh the agent's understanding of the TestAtlas constitution — re-read bootstrap.md from start to finish, re-confirm the first-500-token rules (identity, workspace ownership, instruction precedence, safety, persistence, evidence-or-no-finding), and validate that the token budget is still satisfied.

## Required First Reads

- `.testatlas/bootstrap.md` — the only required read; load it start to finish.

## Required Actions

1. Re-read `.testatlas/bootstrap.md` from start to finish.
2. Confirm the first-500-token rules are still in effect:
   - identity & instruction precedence
   - workspace ownership: `_testatlas/` is the only writable surface
   - safety: `safeMode: true`, `allowDestructiveActions: false`, `allowProductionTesting: false`
   - persistence: `No evidence, no finding.`
3. If bootstrap shards exist under `_testatlas/bootstrap/`, validate every shard against the schema and note any drift.
4. Run `node scripts/check-token-budget.js .testatlas/bootstrap.md 3000` to validate the bootstrap word budget.
5. Note any conflicts between the constitution and prior decisions earlier in the session — surface explicitly. Do not silently override.
6. Close the lifecycle (next section).

## Allowed Tools

- filesystem (read on `.testatlas/` and `_testatlas/bootstrap/`)
- shell (read-only, for the budget check)
- file-write (only the lifecycle close + post-operation brain update)

## Capability Degradation

If `shell` is unavailable, skip the budget-check step and mark the run record `confidence: needs-validation`. Continue to lifecycle close.

## Outputs

- A short paragraph in the agent transcript summarizing the constitution reaffirmed and any conflicts found.
- Lifecycle close entries.

## Stop Conditions

- `.testatlas/bootstrap.md` missing → halt with `Run testatlas install first.`
- Token budget exceeded → surface the count, refuse silent continuation; remediation is a `quick` task to trim bootstrap.

## Completion Criteria

- The agent transcript contains the reaffirmation paragraph.
- Lifecycle artifacts updated.
- An `EVENT-N` of type `command_completed` is appended to `_testatlas/brain/events.jsonl`.

## Post-Operation Brain Update

Call `node scripts/update-brain-after-command.js --command bootstrap-refresh --actor agent --summary "Bootstrap reaffirmed."` to append a `command_completed` event and bump `state.status.last_command`. This is the canonical post-operation brain update path.

## What's Next

- `/atlas:status` — confirm the workspace is in the expected state.
- `/atlas:brain-validate` — verify brain integrity if you suspect drift.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
