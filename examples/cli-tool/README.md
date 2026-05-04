# `examples/cli-tool` — Commander 14 CLI

A minimal commander 14 CLI managing a tiny todo list. Used as the TestAtlas
**Aider-only** reference example (closes EX-07 in plan 08-04 — the bare
CLI source ships here in plan 08-01).

## What this is

- Plain ESM, Node 20.11+, `commander@^14.0.0`, no other runtime deps
- 3 subcommands: `add`, `list`, `complete`
- JSON-file persistence at `~/.config/todo/db.json`
- ~120 LOC across `bin/todo.js` + `lib/store.js` + `lib/format.js`

## How to run

```sh
npm install
npm link              # makes `todo` available on PATH
todo add "buy milk" --due 2026-05-04
todo list
todo complete 1
```

Or run without linking:

```sh
node bin/todo.js add "buy milk"
```

## TestAtlas workspace

Regenerate from the deterministic fixture:

```sh
node ../../scripts/regenerate-example.js examples/cli-tool
```

## Aider-only adapter set (deferred to plan 08-04)

This plan (08-01) ships only the bare CLI source. Plan **08-04** adds the
Aider-specific adapter artifacts (`.aider.conf.yml` + `CONVENTIONS.md`)
and the `confidence: needs-validation` issue that proves capability-aware
degradation is active when only Aider is installed.

The other six adapters (Claude Code, OpenCode, Cursor, KiloCode, MCP,
generic) intentionally have NO trees in this example — that is the
hallmark of the Aider-only setup.

## Seeded findings

The current `_testatlas/to_fix/` ships ONE seeded issue today —
`ISSUE-001-no-validation-on-due-date` (low, confirmed). Plan 08-04 adds a
second issue with `confidence: needs-validation` to demonstrate the
degraded-confidence rule.
