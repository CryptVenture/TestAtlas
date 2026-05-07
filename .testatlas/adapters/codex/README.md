# OpenAI Codex CLI Adapter

This adapter ships TestAtlas's 30 commands as Codex CLI custom prompts. Once installed, every command is invocable in Codex chat as `/prompts:atlas-<name>` (e.g. `/prompts:atlas-init`, `/prompts:atlas-explore-ui`, `/prompts:atlas-plan`).

Codex auto-discovers prompts at `~/.codex/prompts/<name>.md` (see [developers.openai.com/codex/custom-prompts](https://developers.openai.com/codex/custom-prompts)). The `$CODEX_HOME` env var overrides the default location.

## Install

The cleanest path is global:

```sh
npx testatlas init --global
# or, after you've already cloned: 
node install.js --global
```

`--global` writes the 30 prompts to `~/.codex/prompts/atlas-*.md`.

If you'd rather check the rendered prompts into a project repo (so teammates can copy them locally), run a project-local install — files land at `<repo>/.codex/prompts/atlas-*.md` and you can copy them into `~/.codex/prompts/` by hand or via your dotfiles. Codex itself **does not auto-discover project-tree prompts** — they only come into effect after you copy them into `$HOME` (or set `$CODEX_HOME` to the repo).

## Capabilities

Codex declares: `shell`, `web-fetch`, `MCP`, `file-write`. No browser automation surface (Codex doesn't drive a headless browser today). Browser-dependent atlas commands (`/prompts:atlas-explore-ui`, etc.) carry the canonical capability-degradation prose in their bodies — Codex will produce findings flagged `confidence: needs-validation` instead of fabricating a UI scan.

## Format note

Codex prompts are **plain markdown with no YAML frontmatter** — the `description` is documented in an HTML-comment header for human readers, and the prompt body is wrapped in TestAtlas's standard `<!-- TESTATLAS:GENERATED:START ... -->` envelope so the parity gate detects hand-edits and source drift.

## Caveat — deprecation drift

OpenAI's docs mark custom prompts as deprecated in favor of skills (`~/.codex/skills/`). The current Codex CLI still reads `~/.codex/prompts/`, but expect the path to drift. When that happens, the TestAtlas Codex renderer will be updated to emit either form (or a skill manifest); your existing install will continue to work in the meantime.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter codex`. Do **not** hand-edit any `atlas-*.md` under `.codex/prompts/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter codex` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter codex --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14 Wave 5; flattened in Phase 16)

TestAtlas V2 adds 41 categorized commands on top of the 32 V1 flat commands. **Per Phase 16 (`prd/reports/v2-adapter-slash-command-discovery.md`), every source command — V1 and V2 — renders as a flat file at the adapter commands root.** The categorized source-of-truth at `.testatlas/commands/<category>/<name>.md` is preserved unchanged; the adapter tree is flat by render-time policy (`commandBaseNameFromSource` in `scripts/lib/adapters/_shared.js`). Categories shipped: `core` (8), `explore` (11), `test` (4), `council` (11), `brain` (2), `report` (3), `maintain` (2) — total 41. This is critical for Codex: per the [OpenAI Codex docs](https://developers.openai.com/codex/custom-prompts), Codex scans only the top-level Markdown files in `~/.codex/prompts/`, NOT subdirectories — so pre-Phase-16 V2 categorized commands were invisible. Example flat outputs: `.codex/prompts/atlas-init.md` (V1), `.codex/prompts/atlas-core-init.md` (V2 `core/init.md`), `.codex/prompts/atlas-council-domain-review.md` (V2 `council/council-domain-review.md`).

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. Codex CLI sub-spawn via /prompts:atlas-* with persona context bundled.

**Council orchestration supported.** All 11 council commands are available; `atlas-council-domain-review`, `atlas-council-bug-triage`, etc. drive multi-persona debate per PRD §12.

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

