# Google Gemini CLI Adapter

This adapter ships TestAtlas's 30 commands as Gemini CLI custom commands. Once installed, every command is invocable in the Gemini CLI as `/atlas-<name>` (e.g. `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`).

Gemini auto-discovers TOML command files at `<repo>/.gemini/commands/` (project-local) and `~/.gemini/commands/` (user-global). See [geminicli.com/docs/cli/custom-commands](https://geminicli.com/docs/cli/custom-commands/).

## Install

```sh
# Project-local (commands available only in this repo):
npx testatlas init

# Global (commands available in every project):
npx testatlas init --global
```

After install, run `/commands reload` inside the Gemini CLI (or restart it) so it picks up the new files.

## Format

Gemini CLI commands are **TOML, not markdown** — a hard departure from every other TestAtlas adapter. Each rendered file is a complete TOML document:

```toml
description = "..."
prompt = """
<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/<n>.md" hash="<16hex>" -->
First read `.testatlas/bootstrap.md`. ...
<full command body>
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
"""
```

Honored TOML keys (per Gemini docs):

- `prompt` (required) — the prompt body. Multi-line via triple-quoted strings.
- `description` (optional) — shown in `/help`. We always emit a non-empty string so commands don't show ugly auto-generated descriptions.

The marker envelope sits **inside** the TOML triple-quoted prompt so the TestAtlas parity gate's hash check still works.

## Capabilities

Gemini declares: `shell`, `web-fetch`, `MCP`, `file-write`. No browser-driving surface (Gemini doesn't drive a headless browser). Browser-dependent atlas commands carry the canonical capability-degradation prose in their bodies — Gemini will produce findings flagged `confidence: needs-validation` instead of fabricating a UI scan.

## Caveats

- **Reload required.** Gemini caches command definitions. After `npx testatlas init` writes new files, type `/commands reload` (or restart the CLI) before you can invoke them.
- **`{{args}}` and `!{...}` are escaped.** Gemini supports user-arg expansion (`{{args}}`) and shell injection (`!{...}`) inside `prompt`. TestAtlas commands are deterministic recipes — neither pattern belongs in our source bodies. The renderer escapes any literal `{{` / `!{` sequences so user prose containing those byte sequences doesn't accidentally get expanded.
- **Namespace the slash command.** If the bare names collide with another tool's commands, rename `<repo>/.gemini/commands/atlas-*.toml` into `<repo>/.gemini/commands/atlas/<name>.toml`; Gemini will then surface them as `/atlas:<name>`.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter gemini-cli`. Do **not** hand-edit any `atlas-*.toml` under `.gemini/commands/`. The parity gate hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter gemini-cli` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter gemini-cli --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14 Wave 5; flattened in Phase 16)

TestAtlas V2 adds 41 categorized commands on top of the 32 V1 flat commands. **Per Phase 16 (`prd/reports/v2-adapter-slash-command-discovery.md`), every source command — V1 and V2 — renders as a flat file at the adapter commands root.** The categorized source-of-truth at `.testatlas/commands/<category>/<name>.md` is preserved unchanged; the adapter tree is flat by render-time policy (`commandBaseNameFromSource` in `scripts/lib/adapters/_shared.js`). Categories shipped: `core` (8), `explore` (11), `test` (4), `council` (11), `brain` (2), `report` (3), `maintain` (2) — total 41. Example flat outputs: `.gemini/commands/atlas-init.toml` (V1), `.gemini/commands/atlas-core-init.toml` (V2 `core/init.md`), `.gemini/commands/atlas-council-domain-review.toml` (V2 `council/council-domain-review.md`).

### Phase 16 fix: namespace mutation removed

Per the [Gemini CLI docs](https://geminicli.com/docs/cli/custom-commands/), "Subdirectories are used to create namespaced commands, with the path separator (/ or \\) being converted to a colon (:)". Prior to v1.4.0 of `adapter-capabilities.json`, V2 categorized commands were rendered under nested category subdirs — for example, the V2 source `explore/explore-state.md` was written under a nested `explore` directory inside `.gemini/commands/`, which Gemini CLI mutated to slash-invoke as `/atlas-explore:atlas-explore-state` (host-side `dir/file → dir:file` namespacing). The flatten-at-render fix removes the mutation: the file now sits flat at `.gemini/commands/atlas-explore-state.toml` and slash-invokes as `/atlas-explore-state` (single segment, no colon). See `prd/reports/v2-adapter-slash-command-discovery.md` row #8 for the full discovery audit.

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. Gemini CLI multi-agent via TOML command chaining.

**Council orchestration supported.** All 11 council commands are available; `atlas-council-domain-review`, `atlas-council-bug-triage`, etc. drive multi-persona debate per PRD §12.

**Brain sync supported.** Commands read/write `_testatlas/brain/{state,manifest,coverage,graph,events,personas}.json` directly via the `file-write` capability. The `atlas-brain-sync`, `atlas-brain-validate`, and `atlas-brain-query` commands ship as first-class operations.

**Persona context supported.** Persona files (`.testatlas/agents/personas/system/<id>.md` + `.json`) are readable; commands that adopt a persona role load the file and prepend its `Mission`, `Default Stance`, `Files to Read`, and `Output Format` sections to the working context.

### Example V2 Invocations

```
/atlas-init                       # atlas-init.toml (V1 flat)
/atlas-core-init                  # atlas-core-init.toml (V2 core/init.md)
/atlas-council-domain-review      # atlas-council-domain-review.toml (V2 council/council-domain-review.md)
```

### Caveats

