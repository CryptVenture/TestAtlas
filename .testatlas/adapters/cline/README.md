# Cline Adapter

This adapter ships TestAtlas's 30 commands as Cline workflows. Once installed, every command is invocable in Cline chat as `/atlas-<name>.md` (e.g. `/atlas-init.md`, `/atlas-explore-ui.md`, `/atlas-plan.md`). Note the `.md` extension — Cline's slash-command resolver expects the filename verbatim.

Cline auto-discovers workflows at `.clinerules/workflows/<name>.md` per project. There is no fixed global path baked into Cline; we use `~/.config/cline/workflows/` as a portable XDG-style default and document the IDE setting users must point at it.

## Install

```sh
# Project-local (recommended for teams that want workflows in version control):
npx testatlas init
# Or global (one machine, every project sees them):
npx testatlas init --global
```

`--global` writes the 30 workflows to `~/.config/cline/workflows/atlas-*.md`. To make Cline read them, open your IDE's Cline settings and point `cline.workflowsPath` at `~/.config/cline/workflows/`.

Project-local install lands files at `<repo>/.clinerules/workflows/atlas-*.md`. Cline picks them up automatically.

## Capabilities

Cline declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. No degradation prose is emitted — every TestAtlas command runs at full fidelity inside Cline.

## Format

Cline workflows are plain markdown with **no YAML frontmatter**. The `description` is documented in an HTML-comment header for human readers, and the prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **Workflow path is configurable in newer Cline IDEs.** If your `cline.workflowsPath` setting differs from `~/.config/cline/workflows/`, copy the rendered files into the configured directory.
- **Slash invocation requires the `.md` extension.** This is Cline's contract, not a TestAtlas quirk; the README and HTML-comment header reinforce it.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter cline`. Do **not** hand-edit any `atlas-*.md` under `.clinerules/workflows/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter cline` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter cline --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
