<!-- TestAtlas command: atlas-core-brain-validate. Paste .testatlas/bootstrap.md first; description: Run AJV validation across the entire `_testatlas/brain/` tree (22 files) and report any findings. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-validate.md" hash="a04136f72d010971fc029a5e53e45996ff2f7ffc092adaf2f10cb91d13004c6c" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Validate every file under `_testatlas/brain/` against its V2 JSON Schema (Draft 2020-12). Catches missing files, parse errors, schema violations, and JSONL line-level failures. Exits non-zero if any finding exists; zero if the brain is clean.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`

## Required Actions

1. **Preferred path (if `shell`):**
   - Run `node scripts/validate-brain.js`.
   - Exit-0 means clean; exit-1 means findings exist.
2. **Fallback (no `shell`):** parse every JSON/JSONL file under `_testatlas/brain/` and surface any syntax errors. Mark run `confidence: needs-validation` because schema-level checks were skipped.
3. If findings exist: list each as `[CODE] file: message`. Common codes:
   - `BRAIN_DIR_MISSING` — no `_testatlas/brain/` directory.
   - `BRAIN_FILE_MISSING` — required brain file absent.
   - `BRAIN_JSON_PARSE_ERROR` — invalid JSON.
   - `BRAIN_JSONL_PARSE_ERROR` — invalid JSONL line.
   - `BRAIN_REQUIRED_FIELD_MISSING` — top-level field absent.
   - `BRAIN_SCHEMA_VIOLATION` — AJV rejected the value.
4. Recommend remediation for each finding (re-run `/atlas:brain-sync` to fix index drift; manually fix syntax errors; re-run init for missing skeleton files).
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

- `_testatlas/` missing entirely → halt with `Run /atlas:init first.`
- No findings → success path; close lifecycle and exit.

## Completion Criteria

- All 22 brain files (19 JSON + 3 JSONL) inspected.
- Every finding (if any) reported with code + path + remedy.
- A `command_completed` (or `command_aborted` if findings) event recorded.

## Post-Operation Brain Update

Run `node scripts/update-brain-after-command.js --command brain-validate --actor agent --summary "Validation: <ok|N findings>" --status <completed|aborted>`. The status reflects whether the brain was clean — abort routes findings into the event log so future agents see the validation history.

## What's Next

- Findings present → `/atlas:brain-sync` to reconcile, then re-run `/atlas:brain-validate`.
- Clean → `/atlas:status` or whatever next command was planned.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
