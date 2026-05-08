---
command: generate-retest-pack
version: 2.0.0
description: Generate self-contained retest packs from open issue records under `_testatlas/to_fix/`. Each pack carries reproduction steps, pass/fail criteria, evidence refs, and fixtures so any agent can re-verify a fix.
capabilities: [shell, file-write]
produces:
  - command-result
  - retest_pack
consumes:
  - command-instruction
  - issue
  - evidence
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify issues, evidence sidecars, or any source code. Only writes md+json retest pack pairs under `_testatlas/tests/retest_packs/RET-<issue-id>/`.
---

# TestAtlas Command (V2 test): generate-retest-pack

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/manifest.json` and `_testatlas/brain/state.json` (if present).
4. Inspect `_testatlas/to_fix/` for the issue(s) to scaffold.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Issue acceptance criteria become retest packs. A retest pack is a
self-contained reproduction package: preconditions, steps, expected (pass)
and actual (fail-state baseline), evidence references, and fixture notes.
After a candidate fix lands, any agent or human can run the pack and decide
whether the fix actually closes the issue.

Each pack JSON validates against `.testatlas/schemas/retest_pack.schema.json`
and is paired with a human-readable markdown sibling. Packs live under
`_testatlas/tests/retest_packs/RET-<issue-id>/<RETEST-NNNN>.{md,json}`.

## When to Run

- After `/atlas:log-issue` files a new issue with reproduction steps + acceptance criteria.
- After `/atlas:triage` promotes confidence on an issue (e.g., `needs-validation` → `confirmed`).
- During council consolidation when agents agree a regression seed is needed.
- Before a release gate, to refresh open-issue retest packs in bulk via `--all-open`.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json` (if present)
- `_testatlas/to_fix/<ISSUE-id>.json` and the matching `.md`
- `.testatlas/schemas/retest_pack.schema.json`
- `.testatlas/templates/markdown/retest-pack.md`

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-retest-pack.js`. Flags:
     - `--issue-id <ISSUE-id>` — generate a pack for one issue.
     - `--all-open` — generate packs for every issue whose `status` is not `closed` or `obsolete`.
   - The script writes `RET-<issue-id>/RETEST-<NNNN>.{md,json}` and increments `RETEST-NNNN` deterministically against any existing packs.
   - Each JSON validates against `retest_pack.schema.json` (`additionalProperties: false`).
   - On error, halt and surface the script exit code (e.g., `ISSUE_NOT_FOUND`).
2. **Fallback path (no `shell`):**
   - Read each in-scope issue JSON.
   - Build the pack: copy `reproductionSteps[]` into `steps[]`, fold `acceptanceCriteria[]` into `expected`, copy `actualBehavior` into `actual`, copy `evidence[]` verbatim, set `status: "pending"`, set `created_at: <ISO-8601>`.
   - Render the markdown sibling using `.testatlas/templates/markdown/retest-pack.md`.
   - Write atomically via file-write.
3. Append a brain event with `command: generate-retest-pack` and the count of packs produced.
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/to_fix/` + `_testatlas/evidence/`; write on `_testatlas/tests/retest_packs/`)
- shell (preferred path)
- file-write (atomic write of pack md+json pairs)

## Capability Degradation

`shell` unavailable → use the fallback path. The hand-authored pack MUST list every acceptance criterion in `expected` so reviewers can confirm coverage; otherwise the pack is incomplete and the operator should not commit it.

## Status lifecycle

The pack JSON's `status` enum (per the schema): `pending`, `passed`, `failed`, `blocked`, `skipped`, `obsolete`. This command always emits `pending`. `status` is promoted by whichever runner executes the pack — not by this command.

## Outputs

- `_testatlas/tests/retest_packs/RET-<issue-id>/RETEST-<NNNN>.json` (validates against `retest_pack.schema.json`)
- `_testatlas/tests/retest_packs/RET-<issue-id>/RETEST-<NNNN>.md`
- Brain event + lifecycle close.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record retest pack ID + bound issue ID.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new RETEST-* pair appears).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing the issue + pack.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Retest packs are pre-execution scaffolds and are not counted as `testRuns` (the runner that consumes the pack increments `counts.testRuns` upon execution).
- `_testatlas/history/run_log.md` — narrative entry: "Emitted RETEST-`<NNNN>` for ISSUE-`<id>` (status: `pending`)."

## Stop Conditions

- `_testatlas/to_fix/` missing → halt with `TO_FIX_MISSING`.
- `--issue-id` references a non-existent issue → halt with `ISSUE_NOT_FOUND`.
- Schema validation failure on the written file → halt with the AJV error path; do NOT publish a partial pack.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command generate-retest-pack --actor agent --summary "Built retest pack from fixed-pending-retest issues" --status completed` (or `--status aborted` with the error code).

## Completion Criteria

- All `_testatlas/tests/retest_packs/RET-<issue-id>/RETEST-<NNNN>.{md,json}` pairs for in-scope issues exist on disk (per Required Actions).
- Every produced pack JSON validates against `retest_pack.schema.json` (`additionalProperties: false`) and carries `status: "pending"`.
- Every issue ID referenced by an emitted pack resolves to a valid `_testatlas/to_fix/<ISSUE-id>.json` artifact.
- The five lifecycle files (`03_execution_status.md`, `09_artifact_index.md`, `10_command_log.md`, `11_workspace_manifest.json`, `history/run_log.md`) are updated.
- Zero stop conditions triggered (`TO_FIX_MISSING`, `ISSUE_NOT_FOUND`, AJV schema-validation failure all clear; capability gaps require fallback path with explicit acceptance-criterion coverage).

## What's Next

Now that retest packs are generated:

- **`/atlas:retest`** — execute the retest pack you just generated.
- **`/atlas:council-retest`** — formalize retest verdicts via council if outcomes are contested.
