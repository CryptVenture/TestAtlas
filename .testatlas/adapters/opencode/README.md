# OpenCode Adapter

This adapter ships TestAtlas's 30 commands as native OpenCode slash commands at `.opencode/commands/atlas-<command>.md`. After install, the commands appear in OpenCode's TUI as `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`, etc.

## Install

When the Phase 7 installer ships, `npx testatlas init` will copy the contents of `.opencode/` from this adapter into your project's `.opencode/` directory.

Until then, install manually:

```sh
cp -r .testatlas/adapters/opencode/.opencode/ <target-repo>/.opencode/
```

OpenCode auto-discovers commands at `.opencode/commands/<name>.md` per the [OpenCode Commands docs](https://opencode.ai/docs/commands/). Filename minus `.md` becomes the slash command name (`atlas-<command>.md` → `/atlas-<command>`). No registration step required.

## Capabilities

OpenCode declares **all five** capabilities (it's a fully-capable agent framework):

- `browser` (via Chrome DevTools MCP, served by an MCP server registered in OpenCode's config)
- `shell` (built-in command execution)
- `web-fetch` (built-in HTTP client)
- `MCP` (first-class MCP client; supports remote MCP servers)
- `file-write` (Read/Write/Edit baseline)

No degradation prose is needed in any command — OpenCode runs every TestAtlas command at full capability.

## Note on the `agent:` field

OpenCode's command frontmatter optionally declares which OpenCode agent (`build`, `plan`, etc.) executes the command. **TestAtlas leaves `agent:` unset** — every adapter is agent-agnostic by contract, and pinning a specific OpenCode agent would override your local default and prevent the command from running with custom agents you've configured.

If you want a specific TestAtlas command to always use a particular OpenCode agent, either:
1. Set OpenCode's default agent at the project level (it applies to every command), OR
2. Manually add an `agent: <name>` line to the desired `atlas-<command>.md`. The next `assemble-adapter.js --check` run will report this as drift — you can either accept the drift in your local copy or upstream a configuration mechanism for per-command agent pinning.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter opencode`. Do **not** hand-edit any `atlas-*.md` under `.opencode/commands/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter opencode` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter opencode --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. OpenCode supports plugin-driven sub-agents; agents/ dir holds persona definitions.

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

