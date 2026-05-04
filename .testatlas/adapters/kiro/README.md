# Kiro Adapter

This adapter ships TestAtlas's 30 commands as Kiro skills. Once installed, every command is invocable in Kiro chat as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Kiro auto-discovers skills at `.kiro/skills/<name>.md` per project, or `~/.kiro/skills/<name>.md` machine-wide. We ship the **flat-file form** (one `.md` per skill); Kiro 2026 also supports the dir-per-skill form (`<name>/SKILL.md`), but flat files keep parity simple and behave identically inside Kiro.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the 30 skills to `~/.kiro/skills/atlas-*.md`. Kiro picks them up on next launch — open `/help` in chat to confirm.

## Capabilities

Kiro declares: `shell`, `web-fetch`, `MCP`, `file-write`. **No browser automation** — Kiro doesn't drive a headless browser today. Source commands needing `browser` (e.g. `atlas-explore-ui`, `atlas-test-flow`) carry the canonical degradation prose in their bodies via the bootstrap-level §4 contract — Kiro will read static HTML/JSX sources and mark findings `confidence: needs-validation` instead of fabricating UI scans.

## Format

Kiro skills are markdown with a YAML frontmatter block:

- `name: atlas-<command>` — the slash-name (without the leading `/`).
- `description` — copied verbatim from the TestAtlas command source.
- `inclusion: manual` — only injected when the user explicitly slash-invokes the skill; never auto-applied to every chat (which would blow Kiro's context budget across all 30 commands).

The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **No browser surface.** See Capabilities — `atlas-explore-ui`, `atlas-test-flow`, and other UI-runtime commands degrade to static analysis under Kiro.
- **Flat vs dir-per-skill.** This adapter ships flat (`atlas-<name>.md`); the dir-per-skill form (`atlas-<name>/SKILL.md`) works identically in Kiro 2026 if you prefer that layout — just rename and move.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter kiro`. Do **not** hand-edit any `atlas-*.md` under `.kiro/skills/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter kiro` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter kiro --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
