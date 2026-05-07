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

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **simulated** mode. Windsurf single-agent — councils run as multi-pass.

**Council orchestration via simulated multi-pass.** Each council round runs as a sequential prompt; the operator (or the prior round's output) primes the persona context for the next round.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
/atlas-init                       # .windsurf/workflows/atlas-init.md
/atlas-council-domain-review
```

### Caveats

- Council orchestration is simulated: the same agent role-plays each persona sequentially. For high-stakes councils, prefer a subagent-capable adapter (claude-code, opencode, kilocode, codex, gemini-cli, cline, kiro, sourcegraph-amp).
