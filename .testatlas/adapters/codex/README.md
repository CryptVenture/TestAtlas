# OpenAI Codex CLI Adapter

This adapter ships TestAtlas's 30 commands as Codex CLI custom prompts. Once installed, every command is invocable in Codex chat as `/prompts:atlas-<name>` (e.g. `/prompts:atlas-init`, `/prompts:atlas-explore-ui`, `/prompts:atlas-plan`).

Codex auto-discovers prompts at `~/.codex/prompts/<name>.md` (see [developers.openai.com/codex/custom-prompts](https://developers.openai.com/codex/custom-prompts)). The `$CODEX_HOME` env var overrides the default location.

## Install

The cleanest path is global:

```sh
npx testatlas init --global
# or, after you've already cloned: 
node install.js --global
```

`--global` writes the 30 prompts to `~/.codex/prompts/atlas-*.md`.

If you'd rather check the rendered prompts into a project repo (so teammates can copy them locally), run a project-local install — files land at `<repo>/.codex/prompts/atlas-*.md` and you can copy them into `~/.codex/prompts/` by hand or via your dotfiles. Codex itself **does not auto-discover project-tree prompts** — they only come into effect after you copy them into `$HOME` (or set `$CODEX_HOME` to the repo).

## Capabilities

Codex declares: `shell`, `web-fetch`, `MCP`, `file-write`. No browser automation surface (Codex doesn't drive a headless browser today). Browser-dependent atlas commands (`/prompts:atlas-explore-ui`, etc.) carry the canonical capability-degradation prose in their bodies — Codex will produce findings flagged `confidence: needs-validation` instead of fabricating a UI scan.

## Format note

Codex prompts are **plain markdown with no YAML frontmatter** — the `description` is documented in an HTML-comment header for human readers, and the prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Caveat — deprecation drift

OpenAI's docs mark custom prompts as deprecated in favor of skills (`~/.codex/skills/`). The current Codex CLI still reads `~/.codex/prompts/`, but expect the path to drift. When that happens, the TestAtlas Codex renderer will be updated to emit either form (or a skill manifest); your existing install will continue to work in the meantime.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter codex`. Do **not** hand-edit any `atlas-*.md` under `.codex/prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter codex` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter codex --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
