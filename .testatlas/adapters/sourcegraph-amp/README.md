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
