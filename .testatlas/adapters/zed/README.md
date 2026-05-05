# Zed Adapter

This adapter ships TestAtlas's 31 commands as a single concatenated `.rules` file at the repository root. Zed reads project rules from `.rules` (no extension; the file is markdown despite the missing `.md` extension), so every TestAtlas command is visible to the agent at all times.

## Install

```sh
# Project-local (the only supported mode for Zed file rules):
npx testatlas init
```

The file lands at `<repo>/.rules`. Zed picks it up automatically.

## Capabilities

Zed declares: `shell`, `MCP`, `file-write`. **No browser surface, no web-fetch** by default — Zed's chat is more limited than agent CLIs. Source commands needing those capabilities embed the canonical degradation prose; the agent reads static sources and marks findings `confidence: needs-validation`.

## Format

A single markdown file at repo root with **no YAML frontmatter**. The file structure mirrors Aider's CONVENTIONS.md exactly:

- Standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope wrapping the body.
- BOOTSTRAP_PREAMBLE on the first line inside the envelope.
- One-paragraph orientation.
- 31 H2 sections, one per atlas command (`## /atlas-<name>`), each ≤7 lines.

Per-section line cap is **7 lines** (heading + body + trailing blank). Whole-file cap is **210 lines**. The renderer hard-fails (throws) if any section's render would exceed the budget.

## Why one file, not 31

Zed's `.rules` is a single-file convention. We follow it directly — and the concatenated layout mirrors Aider's, Roo's, and Amazon Q's, so the source-of-truth is the same canonical command spec.

## Limitations

- **No file-installable global path.** Zed's machine-wide rules are managed via the UI Rules Library, not the filesystem; `--global` skips this adapter cleanly.
- **No file extension.** Zed's contract is literally `.rules` (no `.md` suffix). Editors may not auto-recognize markdown highlighting; that's expected.
- **Whole-file 210-line cap.** If a future TestAtlas command requires more than the budget allows, it must either trim its description or be refactored into multiple commands.

## Regeneration

This file is **GENERATED** by `node scripts/assemble-adapter.js --adapter zed`. Do **not** hand-edit `.rules` — the parity gate (`node scripts/check-adapter-parity.js`) detects hand-edits via byte-compare against a fresh in-memory render and fails CI. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.

The envelope hash is the SHA-256 prefix over the concatenation of all 31 per-source hashes — any change to any source command bumps the aggregate hash, so the parity gate catches drift on a single-file mutation.
