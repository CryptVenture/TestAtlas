# Sourcegraph Amp Adapter

This adapter ships TestAtlas's 30 commands as Sourcegraph Amp commands. Once installed, every command is invocable in Amp's chat surface as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Amp walks `AGENTS.md` from the current working directory up to `$HOME` and discovers per-command files under `.agents/commands/`. Both project-local (`<repo>/.agents/commands/`) and global (`~/.agents/commands/`) layouts are supported.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the 30 commands to `~/.agents/commands/atlas-*.md`. Amp picks them up automatically — re-open Amp's chat panel to see them in the slash-command picker.

## Capabilities

Amp declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. Every TestAtlas command runs at full fidelity inside Amp — no degradation prose is emitted.

## Format

Amp commands are plain markdown with **no required YAML frontmatter**. The `description` is documented in an HTML-comment header for human readers; Amp displays the file content directly in the slash-command picker. The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **No structured frontmatter.** Amp doesn't standardize a frontmatter schema for `.agents/commands/*.md` (as of mid-2026), so we don't emit one. If a future Amp release adds first-class metadata fields, this adapter will be updated.
- **AGENTS.md walk is the discovery mechanism.** If your project nests Amp configuration deeper than the cwd, ensure an `AGENTS.md` exists at the path Amp walks from.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter sourcegraph-amp`. Do **not** hand-edit any `atlas-*.md` under `.agents/commands/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter sourcegraph-amp` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter sourcegraph-amp --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14 Wave 5; flattened in Phase 16)

TestAtlas V2 adds 41 categorized commands on top of the 32 V1 flat commands. **Per Phase 16 (`prd/reports/v2-adapter-slash-command-discovery.md`), every source command — V1 and V2 — renders as a flat file at the adapter commands root.** The categorized source-of-truth at `.testatlas/commands/<category>/<name>.md` is preserved unchanged; the adapter tree is flat by render-time policy (`commandBaseNameFromSource` in `scripts/lib/adapters/_shared.js`). Categories shipped: `core` (8), `explore` (11), `test` (4), `council` (11), `brain` (2), `report` (3), `maintain` (2) — total 41. Example flat outputs: `.agents/commands/atlas-init.md` (V1), `.agents/commands/atlas-core-init.md` (V2 `core/init.md`), `.agents/commands/atlas-council-domain-review.md` (V2 `council/council-domain-review.md`).

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. Amp sub-agents via .agents/commands/ chain.

**Council orchestration supported.** All 11 council commands are available; `atlas-council-domain-review`, `atlas-council-bug-triage`, etc. drive multi-persona debate per PRD §12.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
/atlas-init                       # bootstrap V2 workspace
/atlas-status                     # show coverage + drift summary
/atlas-council-domain-review      # run council on a domain
```

### Caveats

