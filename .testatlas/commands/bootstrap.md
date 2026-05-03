---
command: bootstrap
version: 1.0.0
description: Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2.
capabilities: [file-write]
produces: []
consumes: []
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT execute any product behavior. Does NOT modify domain/flow/issue artifacts. Refresh-of-understanding only — read bootstrap.md and write the lifecycle close.
---

# TestAtlas Command: bootstrap

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `./_testatlas/11_workspace_manifest.json` if it exists.
4. Inspect the canonical files required by this command.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Refresh the agent's understanding of the TestAtlas constitution and reaffirm the rules in effect for this session per PRD §12.2. This is a no-op in terms of product behavior — its only effect is the standard lifecycle close, so the session record reflects that the agent re-read and reaffirmed the rules.

## Required First Reads

- `.testatlas/bootstrap.md` — the only required read; load it start to finish.

## Required Actions

1. Re-read `.testatlas/bootstrap.md` from start to finish (all 24 PRD §9 sections).
2. Confirm the first-500-token rules are still in effect: identity, workspace ownership (`_testatlas/` is the only writable surface), instruction precedence, safety, and persistence (including `No evidence, no finding.` per `bootstrap.md` §8).
3. Note any conflicts between the constitution and prior decisions taken earlier in this session. Surface each conflict explicitly. Do not silently override.
4. Close the lifecycle (next section).

## Outputs

None beyond lifecycle records. This command intentionally produces no domain/flow/issue artifacts.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — note the bootstrap refresh.
- `_testatlas/09_artifact_index.md` — re-derive (no on-disk artifact change is expected).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt` only.
- `_testatlas/history/run_log.md` — narrative confirmation that the agent re-read the constitution and surfaced any conflicts.

## Stop Conditions

- `.testatlas/bootstrap.md` missing → halt with `Run testatlas install first.`
- Constitution unreadable, truncated, or schema-version mismatched → halt; refuse to fabricate the rules.
- Any prior session decision contradicts a `bootstrap.md` rule and cannot be safely reconciled → halt; surface the conflict per `bootstrap.md` §24 and wait for operator guidance.

## Completion Criteria

The agent emits a one-sentence confirmation that all 24 PRD §9 sections of `.testatlas/bootstrap.md` were re-read and either no precedence conflicts surfaced or the conflicts that did surface are listed verbatim. The five lifecycle files listed above are updated.
