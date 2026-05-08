---
name: atlas-core-brain-compact
description: Summarize long transcripts and run logs into durable summaries; keeps the brain compact without losing decisions or evidence.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-compact.md" hash="2de3a5b2f2e24e1a5b467bb2b8bd8812fbde5b66ade4f738e6d0fba93e86a9a5" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-core-brain-compact.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Keep the brain durable without bloating it. Long transcripts (`agents/councils/sessions/<id>/transcript.jsonl`), run logs (`history/run_log.md`), and rotating evidence captures get summarized into compact records that other agents can still trust. Decisions, claims, and evidence pointers are NEVER discarded — only the free-form prose around them.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/state.json`
- The transcript or log targeted for compaction.

## Required Actions

1. Identify the target file(s) for compaction (passed via `--target` argument or chosen by age threshold — defaults to anything older than 30 days).
2. For each target:
   - Extract structured records (claims, decisions, evidence pointers) — copy verbatim into the corresponding brain index if not already present.
   - Summarize the surrounding free-form prose into a compact paragraph.
   - Replace the original file's free-form prose with the summary, preserving structured records (keep JSONL lines as-is; replace markdown body with the summary).
3. Re-run `node .testatlas/scripts/validate-brain.js` to confirm nothing schema-relevant broke.
4. Close the lifecycle.

## Allowed Tools

- filesystem (read + atomic write on the targeted files)
- shell (for the post-compaction validate-brain run)
- file-write (atomic writes to summarized files; lifecycle close)

## Capability Degradation

`shell` unavailable → skip the post-compaction validate-brain run, mark `needs-validation`. Compaction itself proceeds.

## Outputs

- Compacted summary files at the original paths (atomic writes).
- An entry in `_testatlas/brain/observations.jsonl` recording what was compacted, when, and the source git ref.
- Lifecycle close + brain event.

## Stop Conditions

- Target file missing → halt with the path that was missing.
- A claim, decision, or evidence pointer would be lost during compaction → REFUSE to compact; surface the line and require human approval.

## Completion Criteria

- Every target file is either compacted or explicitly skipped (with a reason).
- `validate-brain.js` exits 0 (or `needs-validation` if shell-degraded).
- A `command_completed` event recorded.

## Post-Operation Brain Update

Run `node .testatlas/scripts/update-brain-after-command.js --command core-brain-compact --actor agent --summary "Compacted N file(s)" --artifacts-written <comma list>`. The compacted file paths are recorded in the event so the audit trail is preserved.

## What's Next

- `/atlas:core-brain-validate` — confirm post-compaction integrity.
- `/atlas:core-brain-export` — archive the (now smaller) brain.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
