# Aider Adapter

TestAtlas commands rendered as a single concatenated `CONVENTIONS.md` file plus a `.aider.conf.yml` snippet that auto-loads it.

## Install

1. Copy `CONVENTIONS.md` to your project root (or any path you prefer).
2. Merge the `read:` list from this adapter's `.aider.conf.yml` into your project's `.aider.conf.yml`. If you don't have one yet, copy this file directly. The `read:` list tells Aider to inject these files into every chat:

   ```yaml
   read:
     - .testatlas/bootstrap.md
     - CONVENTIONS.md
   ```

3. Open Aider in your project. Every TestAtlas command is now invocable by referencing its slash-name (e.g. `/atlas-init`, `/atlas-explore-codebase`) — Aider's chat sees the full list of commands in the loaded CONVENTIONS.md.

## Capabilities

This adapter declares only `[shell, file-write]`. As of mid-2026, Aider does **not** have first-class browser automation, MCP integration, or web fetch — it operates as a pair-programmer that edits files and runs shell commands you approve.

## Capability degradation

13 of the 30 TestAtlas commands need capabilities Aider lacks (browser / MCP / web-fetch — anything requiring runtime observation). For those commands, the CONVENTIONS.md section explicitly carries a one-line `DEGRADED:` note instructing the agent to:

- Read source artifacts statically (HTML/JSX/TSX/Vue/Svelte component files, route definitions, ARIA attributes, CSS utility usage).
- Mark every produced finding `confidence: needs-validation`.
- Add `tool_unavailable: <missing-cap>` to each artifact per `.testatlas/bootstrap.md` §4.
- Never fabricate screenshots, network captures, console output, or DOM snapshots.

The full canonical degradation prose lives in `.testatlas/bootstrap.md` §4 (which Aider reads first per the `read:` ordering above) — the in-CONVENTIONS line is a reference, not the full block, because the per-section line cap forbids it.

## Why one file, not 30

Aider's prompt-injection model concatenates every file in `read:` into every request. Shipping 30 separate command files would 30× the prompt-cache invalidation surface — any single edit to any source command would invalidate the cache for all chats. A single `CONVENTIONS.md` keeps the cache stable and the chat economics healthy.

## Per-section line cap

Each H2 section in `CONVENTIONS.md` is capped at **7 lines** (heading + body, including a trailing blank separator). The renderer hard-fails (throws) if any section's render would exceed this budget — that's the build-time guardrail preventing future command-source growth from silently breaking Aider's prompt budget.

The whole CONVENTIONS.md file is capped at **200 lines** (~30 sections × 7 lines − some shared header). If a future TestAtlas command requires more than the budget allows, it must either trim its description or be refactored into multiple commands.

## Regeneration

`CONVENTIONS.md` and `.aider.conf.yml` are both **GENERATED** by `node scripts/assemble-adapter.js aider`. Do not hand-edit them — the parity gate (`node scripts/check-adapter-parity.js`) detects hand-edits via byte-compare against a fresh in-memory render and fails CI. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.

The `CONVENTIONS.md` envelope hash is the SHA-256 prefix over the concatenation of all 30 per-source hashes — any change to any source command bumps the aggregate hash, so the parity gate catches drift on a single-file mutation.
