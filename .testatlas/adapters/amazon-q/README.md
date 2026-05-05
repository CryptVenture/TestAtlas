# Amazon Q Developer Adapter

This adapter ships TestAtlas's 31 commands as a single concatenated rules file at `.amazonq/rules/atlas.md`. Amazon Q auto-applies project rules from `.amazonq/rules/`; the user prompt library at `~/.aws/amazonq/prompts/` provides machine-wide alternative for the same content.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the file to `~/.aws/amazonq/prompts/atlas.md` (Amazon Q's user-prompt-library convention lives under `.aws/`).

## Capabilities

Amazon Q Developer declares: `shell`, `MCP`, `file-write`. **No browser surface, no web-fetch** in the rules-loaded context (Q's agent surface depends on connected MCP servers; the rules layer alone is text-only). Source commands needing those capabilities embed the canonical degradation prose; the agent reads static sources and marks findings `confidence: needs-validation`.

## Format

A single markdown file with **no YAML frontmatter**. The file structure mirrors Aider's CONVENTIONS.md exactly:

- Standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope wrapping the body.
- BOOTSTRAP_PREAMBLE on the first line inside the envelope.
- One-paragraph orientation.
- 31 H2 sections, one per atlas command (`## /atlas-<name>`), each ≤7 lines.

Per-section line cap is **7 lines** (heading + body + trailing blank). Whole-file cap is **210 lines**. The renderer hard-fails (throws) if any section's render would exceed the budget.

## Why one file, not 31

Amazon Q auto-applies every file in `.amazonq/rules/` into the system context. Shipping 31 separate command files would 31× the prompt-cache invalidation surface — any single edit to any source command would invalidate the cache for all chats. A single concatenated `atlas.md` keeps the cache stable.

## Limitations

- **Rules are auto-applied, not slash-invokable.** Amazon Q's rules layer is read on every interaction. To "run" a TestAtlas command, ask the agent to follow `/atlas-<name>` (the agent reads the corresponding section + the source file at `.testatlas/commands/<name>.md`).
- **Whole-file 210-line cap.** If a future TestAtlas command requires more than the budget allows, it must either trim its description or be refactored into multiple commands.

## Regeneration

This file is **GENERATED** by `node scripts/assemble-adapter.js --adapter amazon-q`. Do **not** hand-edit `atlas.md` — the parity gate (`node scripts/check-adapter-parity.js`) detects hand-edits via byte-compare against a fresh in-memory render and fails CI. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.

The envelope hash is the SHA-256 prefix over the concatenation of all 31 per-source hashes — any change to any source command bumps the aggregate hash, so the parity gate catches drift on a single-file mutation.
