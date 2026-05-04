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

## Aider-only adapter set (closes EX-07)

This example installs **only** the Aider adapter:

- `.aider.conf.yml` — Aider config that pulls `.testatlas/bootstrap.md` +
  `CONVENTIONS.md` into every Aider session
- `CONVENTIONS.md` — concatenated TestAtlas command set rendered for
  Aider per Phase 6's `concatenated-conventions` strategy

Aider's capability set is `["shell", "file-write"]` — **no browser, no
MCP, no web-fetch**. Findings produced via degraded paths must be marked
`confidence: needs-validation` per the ADP-09 capability-degradation
contract (see `.planning/REQUIREMENTS.md`).

The other six adapters (Claude Code, OpenCode, Cursor, KiloCode, MCP,
generic) intentionally have **no** trees in this example — that absence
is the hallmark of the Aider-only setup, and Phase 8's CI matrix (plan
08-04) asserts it on every PR.

## Seeded findings

The `_testatlas/to_fix/` tree ships two seeded issues:

- `ISSUE-001-no-validation-on-due-date-format` — `severity: low`,
  `confidence: confirmed` (a verified bug in the CLI source)
- `ISSUE-002-todo-store-json-file-may-corrupt-under-concurrent-writes-needs-runtime-verification`
  — `severity: medium`, `confidence: needs-validation`. The summary
  begins with `Degradation reason: ...` to document why this finding
  carries the lower confidence (no runtime/shell capability available
  to reproduce the hypothesised concurrent-write race). This is the
  live demonstration of the ADP-09 contract — an Aider agent reading
  the source code can hypothesise a race but cannot prove it without
  shell or MCP capability, so the finding is filed as
  `needs-validation` for a downstream agent with broader capability to
  confirm or refute.
