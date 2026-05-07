---
description: Detect drift between the last exploration and the current repository state and write _testatlas/brain/drift.json with per-domain/flow drift status.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/brain/brain-drift.md" hash="0b5532a44b9e23aa497126466aebbcf85cf41517f8436dd9b0166fa721266fb1" -->
First read `.testatlas/bootstrap.md`. Then read `.claude/commands/atlas-brain-drift.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Detect drift between when each domain/flow/route was last explored and what has changed in the repository since. Writes `_testatlas/brain/drift.json` (one record per change cluster) and `_testatlas/reports/drift.md` (human-readable summary). PRD §7.16 lists the 7 drift inputs:

1. Git diff since last exploration.
2. Package lock changes (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
3. Route file changes (`routes/`, `pages/`, `app/`).
4. API schema changes (OpenAPI specs, GraphQL SDL, RPC IDLs).
5. Migration changes (migration scripts, schema files).
6. Component changes (component source files).
7. Test file changes (test/, spec/, __tests__/).

## When to Run

- Before any decision-grade report.
- After a large code change that may invalidate prior exploration evidence.
- On a schedule (CI nightly; pre-release gate).
- When `brain-score`'s `brain_freshness_score` drops below 70.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/detect-drift.js`. Optional flags: `--since <ref>` (git ref to diff against; defaults to brain's last-run timestamp), `--category {all|domains|flows|apis|routes}`, `--output <path>`.
   - The script computes git diff, watches the 7 input categories, maps changed files to affected domains/flows, assigns drift status per record (`fresh`, `possibly_stale`, `stale_requires_review`, `unknown`), and writes the JSON + report atomically.
2. **Fallback path (no `shell`):**
   - Read git history with `git log` if available; otherwise inspect file mtimes under each input category.
   - Build a drift record per affected domain/flow with the same status taxonomy.
   - Write the same `drift.json` shape via file-write.
3. Append a brain event with `command: brain-drift` summarising the drift counts (fresh / possibly_stale / stale_requires_review / unknown).
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on the entire repo)
- shell (preferred path; `git`, `node`)
- file-write (`_testatlas/brain/drift.json`, `_testatlas/reports/drift.md`)

## Capability Degradation

`shell` unavailable → fall back to mtime-only detection; mark every record `confidence: needs_validation` and emit a warning that git diff coverage was skipped.

## Drift Status Meanings

- **fresh** — domain/flow explored within the last 7 days AND no relevant repo change detected.
- **possibly_stale** — explored 7-30 days ago OR minor changes detected (test edits, comment-only diffs).
- **stale_requires_review** — explored more than 30 days ago OR major changes detected (new routes, API schema diffs, migrations, lock-file bumps).
- **unknown** — no exploration history for this domain/flow; treat as `stale_requires_review` for decision purposes.

## Outputs

- `_testatlas/brain/drift.json` (each record validates against `drift_record.schema.json`).
- `_testatlas/reports/drift.md` (re-rendered TESTATLAS:GENERATED section).
- Brain event + lifecycle close.

## Stop Conditions

- Brain directory missing → halt with `BRAIN_MISSING`.
- Git not available AND `shell` declared → degrade to mtime-only and emit warning; do NOT halt.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-drift --status success` (or `--status failure` with the error code).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
