# KiloCode Adapter

This adapter ships TestAtlas's 30 commands as native KiloCode agents at `.kilo/agents/atlas-<command>.md`. After install, the agents appear in KiloCode's agent picker as `atlas-init`, `atlas-explore-ui`, `atlas-plan`, etc.

## Install

When the Phase 7 installer ships, `npx testatlas init` will copy the contents of `.kilo/` from this adapter into your project's `.kilo/` directory.

Until then, install manually:

```sh
cp -r .testatlas/adapters/kilocode/.kilo/ <target-repo>/.kilo/
```

KiloCode auto-discovers agents at `.kilo/agents/<name>.md` per [kilo.ai/docs/features/custom-modes](https://kilo.ai/docs/features/custom-modes). Filename minus `.md` becomes the agent identifier.

## Capabilities

KiloCode declares **all five** capabilities at the framework level:

- `browser` (via Chrome DevTools MCP)
- `shell` (gated by per-agent `permission.bash`)
- `web-fetch` (built-in)
- `MCP` (first-class MCP client)
- `file-write` (gated by per-agent `permission.edit` glob list)

Per-command degradation is therefore not needed at the prose level — KiloCode's `permission` block does the gating in-band.

## Permission philosophy — the two-tree invariant

Every TestAtlas agent file declares the **load-bearing safety contract**:

```yaml
permission:
  edit:
    "_testatlas/**": allow   # workspace tree (per-project quality intelligence)
    ".testatlas/**": deny    # suite tree (the framework itself — never edit)
    "*": ask                 # everything else requires explicit confirmation
  bash: allow | deny         # mirrors source command's `shell` capability
```

This enforces TestAtlas's **two-tree invariant**:

- The **workspace tree** (`_testatlas/`) is where each project's quality intelligence lives — runs, issues, evidence, reports. Agents may freely edit here.
- The **suite tree** (`.testatlas/`) is the framework itself — bootstrap, command instructions, schemas, templates, adapter sources. Agents **must never edit it**, even if the user asks. The `deny` rule in KiloCode's permission block enforces this even when the user inadvertently authorizes a destructive change.
- Everywhere else (the target repo's source tree, `node_modules/`, etc.), KiloCode's `ask` rule routes through interactive confirmation.

The `bash` permission flips per-command: only commands whose source declares the `shell` capability receive `bash: allow`. Pure file-write commands (e.g., `plan`, `report`, `triage`) receive `bash: deny` — their job is documentation manipulation, not subprocess execution.

## Note on the 2026 unified-agents model

In 2026 KiloCode unified its custom-modes and custom-commands surfaces into a single **agents** model. We emit only the new `.kilo/agents/<name>.md` form per the current docs. The legacy `.kilocodemodes` (YAML/JSON) and `custom_modes.yaml` files are deprecated and **not** shipped by this adapter.

If you're running an older KiloCode that doesn't yet support `.kilo/agents/`, you'll need to either upgrade KiloCode or use the **Generic adapter** (`.testatlas/adapters/generic/`) and paste prompts manually.

## Regeneration

These 30 files are **GENERATED** by `node scripts/assemble-adapter.js --adapter kilocode`. Do **not** hand-edit any `atlas-*.md` under `.kilo/agents/`. The parity gate (`node scripts/check-adapter-parity.js`) hashes the `.testatlas/commands/<name>.md` source and compares it to the `hash="..."` attribute in each derived file's `<!-- TESTATLAS:GENERATED:START -->` marker — drift is rejected.

To safely modify a command:

1. Edit the source file at `.testatlas/commands/<name>.md`.
2. Run `node scripts/assemble-adapter.js --adapter kilocode` to regenerate.
3. Run `node scripts/assemble-adapter.js --adapter kilocode --check` to confirm zero drift.
4. Commit the source change AND the regenerated derived files together.
