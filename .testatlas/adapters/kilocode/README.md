# KiloCode Adapter

This adapter ships TestAtlas's 30 commands as native KiloCode workflows at `.kilocode/workflows/atlas-<command>.md`. After install, the workflows appear in KiloCode's slash-command picker as `/atlas-init`, `/atlas-explore-ui`, `/atlas-plan`, etc.

## Install

When the Phase 7 installer ships, `npx testatlas init` will copy the contents of `.kilocode/` from this adapter into your project's `.kilocode/` directory.

Until then, install manually:

```sh
cp -r .testatlas/adapters/kilocode/.kilocode/ <target-repo>/.kilocode/
```

KiloCode auto-discovers workflows at `.kilocode/workflows/<name>.md` per [kilo.ai/docs/customize/custom-modes](https://kilo.ai/docs/customize/custom-modes). Filename minus `.md` becomes the slash-command identifier.

## Capabilities

KiloCode declares **all five** capabilities at the framework level:

- `browser` (via Chrome DevTools MCP)
- `shell` (gated by per-workflow `permission.bash`)
- `web-fetch` (built-in)
- `MCP` (first-class MCP client)
- `file-write` (gated by per-workflow `permission.edit` glob list)

Per-command degradation is therefore not needed at the prose level — KiloCode's `permission` block does the gating in-band.

## Permission philosophy — the two-tree invariant

Every TestAtlas workflow file declares the **load-bearing safety contract**:

```yaml
permission:
  edit:
    "_testatlas/**": allow   # workspace tree (per-project quality intelligence)
    ".testatlas/**": deny    # suite tree (the framework itself — never edit)
    "*": ask                 # everything else requires explicit confirmation
  bash: allow | deny         # mirrors source command's `shell` capability
```

This enforces TestAtlas's **two-tree invariant**:

- The **workspace tree** (`_testatlas/`) is where each project's quality intelligence lives — runs, issues, evidence, reports. Workflows may freely edit here.
- The **suite tree** (`.testatlas/`) is the framework itself — bootstrap, command instructions, schemas, templates, adapter sources. Workflows **must never edit it**, even if the user asks. The `deny` rule in KiloCode's permission block enforces this even when the user inadvertently authorizes a destructive change.
- Everywhere else (the target repo's source tree, `node_modules/`, etc.), KiloCode's `ask` rule routes through interactive confirmation.

The `bash` permission flips per-command: only commands whose source declares the `shell` capability receive `bash: allow`. Pure file-write commands (e.g., `plan`, `report`, `triage`) receive `bash: deny` — their job is documentation manipulation, not subprocess execution.

## Note on path canonicalization

KiloCode's canonical 2026 path is `.kilocode/workflows/` (full dir name, plural-noun directory). Earlier docs sometimes used `.kilo/agents/`; if you see references to that path in tutorials, they pre-date the unified workflows model. We emit only the canonical form. The detector also accepts `.kilo/` as a signal for legacy-installed projects.

If you're running an older KiloCode that doesn't yet support `.kilocode/workflows/`, you'll need to either upgrade KiloCode or use the **Generic adapter** (`.testatlas/adapters/generic/`) and paste prompts manually.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter kilocode`. Do **not** hand-edit any `atlas-*.md` under `.kilocode/workflows/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter kilocode` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter kilocode --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.

## V2 Command Surface (Phase 14, Wave 5)

TestAtlas V2 adds 30 categorized commands on top of the 32 V1 flat commands. The categorized set is rendered into the adapter's output dir under `core/`, `explore/`, and `council/` subdirectories so V1 commands stay at the root and V2 commands cluster by category. Categories shipped today: `core` (8 commands incl. `init`, `status`, `bootstrap-refresh`, `brain-{compact,export,query,sync,validate}`), `explore` (11 V2 explorers), and `council` (11 council commands). The `test/`, `brain/`, `report/`, and `maintain/` categories are reserved for plans 14-06/07/08.

### V2 Capabilities Declared

- `council-orchestration` — Multi-persona council debate orchestration
- `brain-sync` — Read/write `_testatlas/brain/*.json` from within a command
- `persona-context` — Persona context (read `.testatlas/agents/personas/system/<id>.md` to adopt persona role)

### Persona / Council Strategy

This adapter runs councils in **subagent** mode. KiloCode custom agents — .kilocode/custom-agents/<persona>.md (deferred, future plan).

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

