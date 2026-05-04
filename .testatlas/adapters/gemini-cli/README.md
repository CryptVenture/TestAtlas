# Google Gemini CLI Adapter

This adapter ships TestAtlas's 30 commands as Gemini CLI custom commands. Once installed, every command is invocable in the Gemini CLI as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Gemini auto-discovers TOML command files at `<repo>/.gemini/commands/` (project-local) and `~/.gemini/commands/` (user-global). See [geminicli.com/docs/cli/custom-commands](https://geminicli.com/docs/cli/custom-commands/).

## Install

```sh
# Project-local (commands available only in this repo):
npx testatlas init

# Global (commands available in every project):
npx testatlas init --global
```

After install, run `/commands reload` inside the Gemini CLI (or restart it) so it picks up the new files.

## Format

Gemini CLI commands are **TOML, not markdown** — a hard departure from every other TestAtlas adapter. Each rendered file is a complete TOML document:

```toml
description = "..."
prompt = """
<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
First read `.testatlas/bootstrap.md`. ...
<full command body>
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
"""
```

Honored TOML keys (per Gemini docs):

- `prompt` (required) — the prompt body. Multi-line via triple-quoted strings.
- `description` (optional) — shown in `/help`. We always emit a non-empty string so commands don't show ugly auto-generated descriptions.

The marker envelope sits **inside** the TOML triple-quoted prompt so the TestAtlas parity gate's hash check still works.

## Capabilities

Gemini declares: `shell`, `web-fetch`, `MCP`, `file-write`. No browser-driving surface (Gemini doesn't drive a headless browser). Browser-dependent atlas commands carry the canonical capability-degradation prose in their bodies — Gemini will produce findings flagged `confidence: needs-validation` instead of fabricating a UI scan.

## Caveats

- **Reload required.** Gemini caches command definitions. After `npx testatlas init` writes new files, type `/commands reload` (or restart the CLI) before you can invoke them.
- **`{{args}}` and `!{...}` are escaped.** Gemini supports user-arg expansion (`{{args}}`) and shell injection (`!{...}`) inside `prompt`. TestAtlas commands are deterministic recipes — neither pattern belongs in our source bodies. The renderer escapes any literal `{{` / `!{` sequences so user prose containing those byte sequences doesn't accidentally get expanded.
- **Namespace the slash command.** If the bare names collide with another tool's commands, rename `<repo>/.gemini/commands/atlas-*.toml` into `<repo>/.gemini/commands/atlas/<name>.toml`; Gemini will then surface them as `/atlas:<name>`.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter gemini-cli`. Do **not** hand-edit any `atlas-*.toml` under `.gemini/commands/`. The parity gate hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter gemini-cli` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter gemini-cli --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
