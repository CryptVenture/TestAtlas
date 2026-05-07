# Roo Code Adapter

This adapter ships TestAtlas's 31 commands as a single concatenated rules file at `.roo/rules/atlas.md`. Roo Code concatenates all `.roo/rules/*.md` files into the system prompt alphabetically, so every TestAtlas command is visible to the agent at all times — without 31× the prompt-cache invalidation surface that 31 separate files would create.

## Install

```sh
# Project-local:
npx testatlas init
# Or global:
npx testatlas init --global
```

`--global` writes the file to `~/.roo/rules/atlas.md`.

## Capabilities

Roo Code declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. Every TestAtlas command runs at full fidelity — no per-section degradation prose is needed.

## Format

A single markdown file with **no YAML frontmatter**. The file structure mirrors Aider's CONVENTIONS.md exactly:

- Standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope wrapping the body.
- BOOTSTRAP_PREAMBLE on the first line inside the envelope.
- One-paragraph orientation.
- 31 H2 sections, one per atlas command (`## /atlas-<name>`), each ≤7 lines.

Per-section line cap is **7 lines** (heading + body + trailing blank). Whole-file cap is **210 lines**. The renderer hard-fails (throws) if any section's render would exceed the budget.

## Why one file, not 31

Roo's prompt-injection model concatenates every `.roo/rules/*.md` file into every request. Shipping 31 separate command files would 31× the prompt-cache invalidation surface — any single edit to any source command would invalidate the cache for all chats. A single concatenated `atlas.md` keeps the cache stable and the chat economics healthy.

## Limitations

- **Rules are auto-applied, not slash-invokable.** Roo's rules system loads everything in `.roo/rules/*.md` into the system prompt. To "run" a TestAtlas command, ask the agent to follow `/atlas-<name>` (the agent reads the corresponding section + the source file at `.testatlas/commands/<name>.md`).
- **Whole-file 210-line cap.** If a future TestAtlas command requires more than the budget allows, it must either trim its description or be refactored into multiple commands.

## Regeneration

This file is **GENERATED** by `node scripts/assemble-adapter.js --adapter roo-code`. Do **not** hand-edit `atlas.md` — the parity gate (`node scripts/check-adapter-parity.js`) detects hand-edits via byte-compare against a fresh in-memory render and fails CI. To customize, edit the source command at `.testatlas/commands/<name>.md` and regenerate.

The envelope hash is the SHA-256 prefix over the concatenation of all 31 per-source hashes — any change to any source command bumps the aggregate hash, so the parity gate catches drift on a single-file mutation.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **simulated** mode. Roo Code rule-based — councils run as multi-pass within a single chat.

**Council orchestration via simulated multi-pass.** Each council round runs as a sequential prompt; the operator (or the prior round's output) primes the persona context for the next round.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
# Adapter applies V1 + V2 commands as a single concatenated rules file.
# Operator types the slash-style invocation in chat:
/atlas-init
/atlas-council-domain-review
```

### Caveats

- Council orchestration is simulated: the same agent role-plays each persona sequentially. For high-stakes councils, prefer a subagent-capable adapter (claude-code, opencode, kilocode, codex, gemini-cli, cline, kiro, sourcegraph-amp).
- Concatenated-rules adapters render a SINGLE output file — every command is collapsed to a ≤7-line H2 section. Full command bodies live at `.testatlas/commands/<category>/<name>.md`; the rules file points to the source.
