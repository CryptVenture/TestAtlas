---
command: brain-sync
version: 2.0.0
description: Detect and reconcile drift between markdown artifacts and brain JSON indexes; orchestrates sync-markdown-json + validate-brain.
capabilities: [shell, file-write]
produces:
  - command-result
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify domain/flow/issue source files outside the TESTATLAS:GENERATED markers. Does NOT delete artifacts. Reconciles `_testatlas/brain/<index>.json` from on-disk artifacts and refreshes generated sections in markdown.
---

# TestAtlas Command (V2 core): brain-sync

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/state.json` and `_testatlas/brain/manifest.json`.
4. Inspect any canonical files this command needs.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Reconcile drift between human-authored markdown (`_testatlas/domains/<slug>/domain.md`, `flows/`, `to_fix/`, `agents/personas/`) and machine-readable brain indexes (`_testatlas/brain/<index>.json`). Markdown wins for human prose; JSON index wins for catalog state. Generated sections inside markdown are refreshed atomically.

## When to Run

- After hand-editing any artifact's markdown.
- Before `/atlas:report` so the report reads consistent state.
- After every council `/atlas:consolidate` to absorb structured outputs.
- On suspicion of drift (e.g. CI flagged a stale-index test).

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node scripts/sync-markdown-json.js`. The script is idempotent — second invocation with no on-disk changes writes nothing.
   - Run `node scripts/index-artifacts.js` to rebuild brain indexes from artifact scans.
   - Run `node scripts/validate-brain.js` to confirm the brain is schema-valid post-sync.
2. **Fallback path (no `shell`):**
   - Read each domain's `domain.md` + `domain.json`; if mtimes differ, surface drift; mark run `confidence: needs-validation`.
   - Do NOT auto-write JSON; halt with the drift list and instruct the next agent to run with `shell`.
3. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/`)
- shell (preferred path)
- file-write (atomic writes to `_testatlas/brain/<index>.json` and TESTATLAS:GENERATED markdown sections only)

## Capability Degradation

`shell` unavailable → no auto-sync; report drift only and mark `needs-validation`.

## Outputs

- Updated `_testatlas/brain/<index>.json` files (only when content changed).
- Updated `<!-- TESTATLAS:GENERATED:START ... -->` sections in markdown (only when content changed).
- Lifecycle close + brain event.

## Stop Conditions

- `_testatlas/brain/` missing → halt with `Run /atlas:init first.`
- AJV validation fails after sync → halt; do not commit drift; surface findings verbatim.

## Completion Criteria

- `validate-brain.js` exits 0.
- Lifecycle artifacts updated.
- A `command_completed` event recorded in `events.jsonl`.

## Post-Operation Brain Update

Run `node scripts/update-brain-after-command.js --command brain-sync --actor agent --summary "Brain synced — N changes" --reindex`. The `--reindex` flag re-runs `index-artifacts.js` to ensure state.json counts agree with on-disk artifacts; the event is appended automatically.

## What's Next

- `/atlas:brain-validate` — confirm clean state.
- `/atlas:status` — view the refreshed brain summary.
