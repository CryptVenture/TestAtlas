# Continue.dev Adapter

This adapter ships TestAtlas's 30 commands as Continue.dev prompts. Once installed, every command is invocable in Continue's Chat / Plan / Agent modes as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Continue auto-discovers prompts at `.continue/prompts/<name>.prompt.md` per project, or `~/.continue/prompts/<name>.prompt.md` machine-wide.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the 30 prompts to `~/.continue/prompts/atlas-*.prompt.md`. Continue picks them up automatically — open the slash-command picker to confirm they appear.

## Capabilities

Continue declares: `shell`, `web-fetch`, `MCP`, `file-write`. **No first-class browser automation** in Continue today (Agent mode runs tools, but headless-browser drivers are MCP-server-provided rather than core). Source commands needing `browser` carry the canonical degradation prose in their bodies; Continue will work statically from source artifacts and mark findings `confidence: needs-validation`.

## Format

Continue prompts are markdown with a YAML frontmatter block:

- `name: atlas-<command>` — the slash-name (without the leading `/`).
- `description` — copied verbatim from the TestAtlas command source; shown in the slash-command picker.
- `invokable: true` — surfaces the prompt in the slash-command picker (Continue's contract for user-invokable prompts).

The prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **Browser-only commands degrade.** `atlas-explore-ui`, `atlas-test-flow`, and similar UI-runtime commands run as static-analysis under Continue (see Capabilities).
- **Mode selection is the user's choice.** TestAtlas doesn't pin Chat / Plan / Agent — you choose at invocation time. Most commands work best in Agent mode.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter continue-dev`. Do **not** hand-edit any `atlas-*.prompt.md` under `.continue/prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter continue-dev` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter continue-dev --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
