# Cursor Adapter

TestAtlas commands rendered as Cursor 2026 flat-MDC rule files.

## Install

Copy the contents of `.cursor/rules/` from this adapter into your project's `.cursor/rules/` directory:

```sh
cp -r .testatlas/adapters/cursor/.cursor/rules/atlas-*.mdc <your-project>/.cursor/rules/
```

Cursor 2.x auto-discovers any `.mdc` file under `.cursor/rules/`. To invoke a TestAtlas command, mention the rule by name in chat (e.g. `@atlas-init`) or attach it manually via the rules picker.

## Capabilities

This adapter declares `[shell, web-fetch, file-write]`. As of mid-2026, Cursor's in-product agent does **not** have first-class browser automation or general-purpose MCP integration — its tool surface is more limited than Claude Code's. The MCP "tools" tab in Cursor 2.2 covers a different (read-mostly) set of operations than what TestAtlas's `MCP` capability assumes (full Chrome DevTools MCP browser control).

For commands whose source declares `browser` or `MCP` (e.g. `atlas-explore-ui`, `atlas-test-flow`, `atlas-explore-accessibility`), the renderer injects a `## Capability Degradation` block at the end of the rule body. This block tells the receiving agent to:

1. Read source artifacts statically (HTML/JSX/TSX/Vue/Svelte component files, route definitions, ARIA attributes in JSX, CSS/Tailwind utility usage).
2. Mark every produced finding `confidence: needs-validation`.
3. Add `tool_unavailable: <missing-cap>` to each artifact per `.testatlas/bootstrap.md` §4.
4. Never fabricate screenshots, network captures, console output, or DOM snapshots.

The degradation prose is identical to the canonical wording used by the Aider adapter and shipped from `_capability-degradation.js` — agents that operate under multiple TestAtlas adapters see consistent rules.

## Note on flat-MDC vs folder format

Phase 6 ships **flat** `.cursor/rules/<name>.mdc` files. Cursor 2.2 (mid-2026) announced a folder form (`.cursor/rules/<name>/RULE.md`) but it is non-functional in shipped builds as of this writing. Flat MDC is the verified-working format. If a future Cursor release ships folders working, a TestAtlas update will add a renderer variant; existing flat installs will continue to work.

## Frontmatter

Each `.mdc` file's frontmatter is locked to:

```yaml
---
description: <copied verbatim from source command>
globs:
alwaysApply: false
---
```

`globs:` is intentionally empty — TestAtlas commands aren't file-scoped; the user invokes them via `@atlas-<command>` mention or by selecting the rule from Cursor's picker. `alwaysApply: false` prevents the rule from being injected into every conversation regardless of intent.

## Regeneration

These files are **GENERATED** by `node scripts/assemble-adapter.js cursor`. Do not hand-edit them — the parity gate (`node scripts/check-adapter-parity.js`) detects hand-edits via byte-compare against a fresh in-memory render and fails CI. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.
