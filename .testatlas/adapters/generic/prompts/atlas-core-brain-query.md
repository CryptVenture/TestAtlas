<!-- TestAtlas command: atlas-core-brain-query. Paste .testatlas/bootstrap.md first; description: Answer a question about the workspace by reading brain JSON; cite file paths for every claim. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/brain-query.md" hash="d37c06a7142342658bfd5a8b52711397e4d4ec197c6bb6063b79ef144548a65c" -->
First read `.testatlas/bootstrap.md`. Then read `prompts/atlas-core-brain-query.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

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

- Brain dir missing → halt with `Run /atlas:core-init first.`
- Question is out of scope (e.g. "is this code production-ready?") → answer with caveats and refuse to invent.

## Completion Criteria

- Every claim has a path citation OR is explicitly marked as "no record."
- Lifecycle artifacts updated.
- A `command_completed` event recorded in `events.jsonl`.

## Post-Operation Brain Update

Run `node .testatlas/scripts/update-brain-after-command.js --command brain-query --actor agent --summary "Q: <question summary>"`. This appends a `command_completed` event so future agents see what was asked — useful for spotting repeated questions and gaps in coverage.

## What's Next

- Question revealed a coverage gap → `/atlas:explore-<area>` for the missing area.
- Question revealed stale data → `/atlas:core-brain-sync` then re-query.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
