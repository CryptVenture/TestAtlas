---
description: Detect and reconcile drift between markdown artifacts and brain JSON indexes; orchestrates sync-markdown-json + validate-brain.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-sync.md" hash="3bdfa3521cf395d1de7ee921af70408adaa09f7cd4ce1dbace9d1625c9230908" -->
First read `.testatlas/bootstrap.md`. Then read `.windsurf/workflows/atlas-core-brain-sync.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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
   - Run `node .testatlas/scripts/sync-markdown-json.js`. The script is idempotent — second invocation with no on-disk changes writes nothing.
   - Run `node .testatlas/scripts/index-artifacts.js` to rebuild brain indexes from artifact scans.
   - Run `node .testatlas/scripts/update-graph.js` to refresh `_testatlas/brain/graph.json` (PRD §11 16-relationship knowledge graph).
   - Run `node .testatlas/scripts/validate-brain.js` to confirm the brain is schema-valid post-sync.
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

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-sync --actor agent --summary "Brain synced — N changes" --reindex`. The `--reindex` flag re-runs `index-artifacts.js` to ensure state.json counts agree with on-disk artifacts; the event is appended automatically.

## What's Next

- `/atlas:brain-validate` — confirm clean state.
- `/atlas:status` — view the refreshed brain summary.
- `/atlas:brain-compact` — distill long transcripts and run logs into durable summaries when the brain grows large.
- `/atlas:brain-query` — answer a question about the workspace by reading the freshly-synced brain JSON.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
