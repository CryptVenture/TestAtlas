# Cline Adapter

This adapter ships TestAtlas's 30 commands as Cline workflows. Once installed, every command is invocable in Cline chat as `/atlas-<name>.md` (e.g. `/atlas-init.md`, `/atlas-explore-ui.md`, `/atlas-plan.md`). Note the `.md` extension — Cline's slash-command resolver expects the filename verbatim.

Cline auto-discovers workflows at `.clinerules/workflows/<name>.md` per project. There is no fixed global path baked into Cline; we use `~/.config/cline/workflows/` as a portable XDG-style default and document the IDE setting users must point at it.

## Install

```sh
# Project-local (recommended for teams that want workflows in version control):
npx testatlas init
# Or global (one machine, every project sees them):
npx testatlas init --global
```

`--global` writes the 30 workflows to `~/.config/cline/workflows/atlas-*.md`. To make Cline read them, open your IDE's Cline settings and point `cline.workflowsPath` at `~/.config/cline/workflows/`.

Project-local install lands files at `<repo>/.clinerules/workflows/atlas-*.md`. Cline picks them up automatically.

## Capabilities

Cline declares all five: `browser`, `shell`, `web-fetch`, `MCP`, `file-write`. No degradation prose is emitted — every TestAtlas command runs at full fidelity inside Cline.

## Format

Cline workflows are plain markdown with **no YAML frontmatter**. The `description` is documented in an HTML-comment header for human readers, and the prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Limitations

- **Workflow path is configurable in newer Cline IDEs.** If your `cline.workflowsPath` setting differs from `~/.config/cline/workflows/`, copy the rendered files into the configured directory.
- **Slash invocation requires the `.md` extension.** This is Cline's contract, not a TestAtlas quirk; the README and HTML-comment header reinforce it.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter cline`. Do **not** hand-edit any `atlas-*.md` under `.clinerules/workflows/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter cline` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter cline --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14 Wave 5; flattened in Phase 16)

TestAtlas V2 adds 41 categorized commands on top of the 32 V1 flat commands. **Per Phase 16 (`prd/reports/v2-adapter-slash-command-discovery.md`), every source command — V1 and V2 — renders as a flat file at the adapter commands root.** The categorized source-of-truth at `.testatlas/commands/<category>/<name>.md` is preserved unchanged; the adapter tree is flat by render-time policy (`commandBaseNameFromSource` in `scripts/lib/adapters/_shared.js`). Categories shipped: `core` (8), `explore` (11), `test` (4), `council` (11), `brain` (2), `report` (3), `maintain` (2) — total 41. Example flat outputs: `.clinerules/workflows/atlas-init.md` (V1), `.clinerules/workflows/atlas-core-init.md` (V2 `core/init.md`), `.clinerules/workflows/atlas-council-domain-review.md` (V2 `council/council-domain-review.md`).

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. Cline workflows can chain — each council round is a separate workflow invocation.

**Council orchestration supported.** All 11 council commands are available; `atlas-council-domain-review`, `atlas-council-bug-triage`, etc. drive multi-persona debate per PRD §12.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
/atlas-init                       # bootstrap V2 workspace
/atlas-status                     # show coverage + drift summary
/atlas-council-domain-review      # run council on a domain
```

### Caveats

