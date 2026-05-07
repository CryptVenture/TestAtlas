<!-- TestAtlas command: atlas-generate-retest-pack. Invoke as /prompts:atlas-generate-retest-pack. Description: Generate self-contained retest packs from open issue records under `_testatlas/to_fix/`. Each pack carries reproduction steps, pass/fail criteria, evidence refs, and fixtures so any agent can re-verify a fix. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test/generate-retest-pack.md" hash="c62993a2c64bed7e2ecda64103d72a19bfa4d3f79469da67afe507aac62b97e9" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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
   - Run `node scripts/generate-retest-pack.js`. Flags:
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

## Stop Conditions

- `_testatlas/to_fix/` missing → halt with `TO_FIX_MISSING`.
- `--issue-id` references a non-existent issue → halt with `ISSUE_NOT_FOUND`.
- Schema validation failure on the written file → halt with the AJV error path; do NOT publish a partial pack.

## Update Brain After Command

Run `node scripts/update-brain-after-command.js --command generate-retest-pack --status success` (or `--status failure` with the error code).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
