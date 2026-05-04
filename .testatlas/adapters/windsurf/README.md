# Windsurf / Cascade Adapter

This adapter ships TestAtlas's 30 commands as Windsurf Cascade workflows. Once installed, every command is invocable in the Cascade chat panel as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Windsurf auto-discovers workflows at `.windsurf/workflows/<name>.md` per project. As of mid-2026 Windsurf has **no documented global filesystem path** for workflows, so this adapter is project-local only.

## Install

```sh
# Project-local (the only supported mode for Windsurf):
npx testatlas init
```

Files land at `<repo>/.windsurf/workflows/atlas-*.md`. Windsurf picks them up automatically — restart the Cascade panel if you don't see them in `/help` immediately.

## Capabilities

Windsurf declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. Cascade's tool surface is comparable to Claude Code's, so no per-command degradation prose is needed.

## Format

Windsurf workflows are markdown with a small YAML frontmatter block:

- `description` — copied verbatim from the TestAtlas command source.
- `auto_execution_mode: 1` — Cascade convention; mode 1 = manual step-through (the safest default; the agent stops between steps for confirmation).

The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **No global install.** Windsurf has no documented `$HOME` workflow path; `--global` skips this adapter cleanly with a one-line notice.
- **`auto_execution_mode: 1` is intentional.** TestAtlas commands are deliberate, evidence-collecting flows; switching to mode 3 (full auto) is a user choice, not a default.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter windsurf`. Do **not** hand-edit any `atlas-*.md` under `.windsurf/workflows/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter windsurf` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter windsurf --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
