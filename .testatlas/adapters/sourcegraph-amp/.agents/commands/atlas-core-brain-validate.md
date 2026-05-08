<!-- TestAtlas command: atlas-core-brain-validate. Invoke as /atlas-core-brain-validate. Description: Run AJV validation across the entire `_testatlas/brain/` tree (22 files) and report any findings. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-validate.md" hash="f346e12ee84d55a7511a00171a6a002eef51ff915d0f3c9a22d5a81c13e100a4" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-core-brain-validate.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Validate every file under `_testatlas/brain/` against its V2 JSON Schema (Draft 2020-12). Catches missing files, parse errors, schema violations, and JSONL line-level failures. Exits non-zero if any finding exists; zero if the brain is clean.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`

## Required Actions

1. **Preferred path (if `shell`):**
   - Run `node .testatlas/scripts/validate-brain.js`.
   - Exit-0 means clean; exit-1 means findings exist.
2. **Fallback (no `shell`):** parse every JSON/JSONL file under `_testatlas/brain/` and surface any syntax errors. Mark run `confidence: needs-validation` because schema-level checks were skipped.
3. If findings exist: list each as `[CODE] file: message`. Common codes:
   - `BRAIN_DIR_MISSING` — no `_testatlas/brain/` directory.
   - `BRAIN_FILE_MISSING` — required brain file absent.
   - `BRAIN_JSON_PARSE_ERROR` — invalid JSON.
   - `BRAIN_JSONL_PARSE_ERROR` — invalid JSONL line.
   - `BRAIN_REQUIRED_FIELD_MISSING` — top-level field absent.
   - `BRAIN_SCHEMA_VIOLATION` — AJV rejected the value.
4. Recommend remediation for each finding (re-run `/atlas:core-brain-sync` to fix index drift; manually fix syntax errors; re-run init for missing skeleton files).
5. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/` and `.testatlas/schemas/`)
- shell (preferred path)
- file-write (lifecycle close only)

## Capability Degradation

`shell` unavailable → fallback path runs presence + JSON-parse only. Mark run `needs-validation`.

## Outputs

- A finding-list block in the agent transcript.
- Exit code (when invoked via `/atlas` adapter): 0 clean, non-zero with findings.
- Lifecycle close + brain event.

## Stop Conditions

- `_testatlas/` missing entirely → halt with `Run /atlas:core-init first.`
- No findings → success path; close lifecycle and exit.

## Brain Files Inventory

The 22 required brain files validated by this command:

- `_testatlas/brain/manifest.json` — V2 manifest (schema_version, suite_version, project_name, adapters).
- `_testatlas/brain/state.json` — current workspace state snapshot.
- `_testatlas/brain/quality_scores.json` — per-domain/flow quality score signals.
- `_testatlas/brain/drift.json` — drift signals across markdown↔JSON boundaries.
- `_testatlas/brain/coverage.json` — coverage matrix indexed by flow + scenario.
- `_testatlas/brain/graph.json` — 16-relationship knowledge graph (populated by `node .testatlas/scripts/update-graph.js` from `/atlas:core-brain-sync`).
- Remaining 16 JSON/JSONL indexes per V2 brain schema (`events.jsonl`, council/persona/agent indexes, etc.) — full enumeration in `.testatlas/schemas/manifest.schema.json`.

## Completion Criteria

- All 22 brain files (19 JSON + 3 JSONL) inspected.
- Every finding (if any) reported with code + path + remedy.
- A `command_completed` (or `command_aborted` if findings) event recorded.

## Post-Operation Brain Update

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-validate --actor agent --summary "Validation: <ok|N findings>" --status <completed|aborted>`. The status reflects whether the brain was clean — abort routes findings into the event log so future agents see the validation history.

## What's Next

- Findings present → `/atlas:core-brain-sync` to reconcile, then re-run `/atlas:core-brain-validate`.
- Clean → `/atlas:core-status` or whatever next command was planned.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
