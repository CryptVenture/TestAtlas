---
command: brain-query
version: 2.0.0
description: Answer a question about the workspace by reading brain JSON; cite file paths for every claim.
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
boundary: Read-only over `_testatlas/brain/`. Never invents a fact; every claim cites a path. Only writes the lifecycle close + a brain event documenting the query.
---

# TestAtlas Command (V2 core): brain-query

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

Answer questions about the workspace using only what is written down — `_testatlas/brain/*.json`, `*.jsonl`, plus the canonical artifacts those indexes point at. Every assertion in the answer must cite a file path. If the answer cannot be derived from the brain, the agent says so explicitly and proposes a `/atlas:explore-<area>` follow-up.

## Required First Reads

- `.testatlas/bootstrap.md`
- The brain JSON file most relevant to the question (e.g. `domains.json` for "what domains are mapped?", `issues.json` for severity questions).
- `_testatlas/brain/state.json` for context.

## Required Actions

1. Parse the user question. Identify the brain index(es) to consult.
2. Load only those indexes — don't read everything by default.
3. Form an evidence-cited answer: each statement carries a `(_testatlas/brain/<file>.json#/path)` reference or a path to the canonical artifact.
4. If the answer requires data the brain doesn't have, say so verbatim ("brain has no record of …") and recommend the next command.
5. Close the lifecycle.

## No-Hallucination Rule

If a fact cannot be cited to a real path that resolves on disk, refuse to claim it. Use phrasing like "no record of X in `_testatlas/brain/` as of `<state.last_updated>`."

## Allowed Tools

- filesystem (read on `_testatlas/`)
- file-write (lifecycle close only)

## Capability Degradation

None required — all reads are local filesystem.

## Outputs

- A markdown answer block in the agent transcript with cited paths.
- Lifecycle close + brain event documenting the question summary.

## Stop Conditions

- Brain dir missing → halt with `Run /atlas:init first.`
- Question is out of scope (e.g. "is this code production-ready?") → answer with caveats and refuse to invent.

## Completion Criteria

- Every claim has a path citation OR is explicitly marked as "no record."
- Lifecycle artifacts updated.
- A `command_completed` event recorded in `events.jsonl`.

## Post-Operation Brain Update

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-query --actor agent --summary "Q: <question summary>"`. This appends a `command_completed` event so future agents see what was asked — useful for spotting repeated questions and gaps in coverage.

## What's Next

- Question revealed a coverage gap → `/atlas:explore-<area>` for the missing area.
- Question revealed stale data → `/atlas:brain-sync` then re-query.
