# Claude Code Adapter (canonical)

This is the **canonical** TestAtlas adapter. Every other adapter is derived from the same `.testatlas/commands/*.md` source-of-truth, but Claude Code's slash-command format is the reference implementation we measure parity against.

## Install

When the Phase 7 installer ships, `npx testatlas init` will copy the contents of `.claude/` from this adapter into your project's `.claude/` directory.

Until then, install manually:

```sh
cp -r .testatlas/adapters/claude-code/.claude/ <target-repo>/.claude/
```

After install, the 30 commands appear as `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`, etc. in Claude Code's slash-command palette.

## Capabilities

Claude Code declares all five capabilities — no degradation:

- `browser` (via Chrome DevTools MCP)
- `shell` (Bash tool)
- `web-fetch` (WebFetch tool)
- `MCP` (mcp__\*)
- `file-write` (Read/Write/Edit baseline)

Each derived `atlas-*.md` file's `allowed-tools` frontmatter is the conservative translation: a baseline of `Read, Write, Edit, Glob, Grep` plus `Bash` / `WebFetch` / `mcp__*` per the source command's declared capabilities.

## Limitations

- **Skills format deferred.** Claude Code's 2026 SDK recommends `.claude/skills/<name>/SKILL.md` for autonomously-invokable behaviors. TestAtlas intentionally ships the slash-command format (`.claude/commands/*.md`) per PRD §7 because the user-controlled invocation model matches the framework's safety contract. Skills support is a candidate for a future phase.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter claude-code`. Do **not** hand-edit any `atlas-*.md`. The parity gate (Plan 06-02) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter claude-code` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter claude-code --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. Sub-agents via Task tool. .claude/agents/<persona>.md (when shipped) registers system personas as Task targets.

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

