# GitHub Copilot Adapter

This adapter ships TestAtlas's 30 commands as GitHub Copilot prompt files. Once installed, every command is invocable in the Copilot chat panel (VS Code, Visual Studio, JetBrains) by referencing the prompt file via `/` or the prompt picker.

Copilot auto-discovers prompts at `.github/prompts/<name>.prompt.md` per project. As of mid-2026 GitHub Copilot has **no documented global filesystem path** for prompts — machine-wide steering is configured via the `github.copilot.chat.codeGeneration.instructions` user setting, which is not file-installable. `--global` therefore skips this adapter cleanly.

## Install

```sh
# Project-local (the only file-installable mode for Copilot):
npx testatlas init
```

Files land at `<repo>/.github/prompts/atlas-*.prompt.md`. Copilot picks them up automatically — restart the chat panel if you don't see them in the prompt picker immediately.

## Capabilities

Copilot declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. With Copilot's 2026 agent mode + MCP tool surface, every TestAtlas command runs at full fidelity — no degradation prose is emitted.

## Format

Copilot prompt files are markdown with a YAML frontmatter block:

- `mode: agent` — runs as an autonomous agent (not a one-shot chat completion); required for tool use.
- `description` — copied verbatim from the TestAtlas command source; shown in the prompt picker.

The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **No file-installable global path.** `--global` skips this adapter; for machine-wide steering, edit `github.copilot.chat.codeGeneration.instructions` in VS Code user settings manually.
- **`tools:` field is not declared.** TestAtlas leaves the `tools` array unset so Copilot grants the default agent toolset; if your org policy restricts tools, edit your VS Code user setting (`github.copilot.chat.allowedTools`) rather than per-prompt.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter github-copilot`. Do **not** hand-edit any `atlas-*.prompt.md` under `.github/prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter github-copilot` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter github-copilot --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
