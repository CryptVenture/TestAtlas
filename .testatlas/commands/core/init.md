---
command: init
version: 2.0.0
description: Bootstrap or upgrade a TestAtlas V2 workspace — creates `_testatlas/brain/` skeleton, registers adapters, and writes a v2 manifest.
capabilities: [shell, file-write]
produces:
  - workspace-manifest
  - app-map
  - command-result
consumes:
  - command-instruction
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify `.testatlas/` (suite tree). Does NOT mutate target-repo source files. On existing V1 workspaces, performs additive V2 upgrade — does NOT remove V1 artifacts.
---

# TestAtlas Command (V2 core): init

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/state.json` and `_testatlas/brain/manifest.json`.
4. Inspect any canonical files this command needs.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Bring a target repository to a clean V2 baseline — `_testatlas/` directory tree (canonical V1 files preserved) PLUS the V2 brain skeleton (`_testatlas/brain/` with 22 files: 19 JSON + 3 JSONL). On an existing V1 workspace, run in `--mode upgrade` to ADD the brain skeleton without removing V1 artifacts.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/default.config.json`
- The target repository's `package.json` / `pyproject.toml` / `Cargo.toml` for runtime detection.

## Required Actions

1. **Preferred path (if `shell`):** run `node .testatlas/scripts/init-workspace.js` from the target repo root. The script is idempotent — fresh repos report `status: initialized`; previously-V1 repos run additive V2 upgrade with `status: partial-fill`. After init, `node .testatlas/scripts/sync-status.js` reconciles `_testatlas/03_execution_status.md` AND `_testatlas/00_overview.md` generated sections from manifest counts in one call.
2. **V2 upgrade specifics:**
   - Ensure `_testatlas/brain/` exists with all 22 required files (delegated to `init-workspace.js` Wave 0/1 helpers).
   - Mirror schemas to `_testatlas/brain/schema/` for offline validation.
   - Update `_testatlas/brain/manifest.json` with `schema_version: "2.0.0"`, `suite_version`, `initialized_at`, `last_updated`, `project_name`.
3. **Adapter registration:** detect any agent-specific adapter directories (`.claude/`, `.cursor/`, `.opencode/`, etc.) and record them in `manifest.adapters`.
4. **Fallback (no `shell`):** layout files manually per PRD §8 plus the V2 brain. Mark run `confidence: needs-validation` because runtime detection is unavailable.
5. Validate the resulting manifest against `workspace-manifest.schema.json` AND `manifest.schema.json` (V2). If validation fails, halt and surface AJV errors verbatim.
6. Close the lifecycle.

## Allowed Tools

- shell (preferred path)
- file-write (atomic writes to `_testatlas/`; never to `.testatlas/`)
- filesystem (read on suite tree + target repo's package metadata files)

## Capability Degradation

`shell` unavailable → manual fallback path. Mark `confidence: needs-validation`.

## Outputs

- `_testatlas/` directory tree (V1 23 subdirs + V2 brain).
- 14 V1 canonical markdown files (already shipped); 22 V2 brain files (19 JSON + 3 JSONL).
- `_testatlas/11_workspace_manifest.json` (V1) and `_testatlas/brain/manifest.json` (V2).
- Lifecycle close + brain event.

## Stop Conditions

- `.testatlas/` suite tree missing → halt with `Run testatlas install first.`
- Existing `_testatlas/` whose V1 manifest does not validate → halt; refuse to recreate without `--force`.
- Target repo path is not writable → halt; never proceed silently.
- `safeMode: true` AND any required step would mutate target-repo source files → halt; only `_testatlas/` is writable.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute counts.
- `_testatlas/history/run_log.md` — narrative log entry for this run.

## Completion Criteria

- `_testatlas/11_workspace_manifest.json` validates and records `status: initialized` (or `partial-fill` for upgrade).
- `_testatlas/brain/manifest.json` validates against `manifest.schema.json` (V2).
- All 22 V2 brain files present.
- Lifecycle artifacts updated.
- A `command_completed` event recorded.

## Post-Operation Brain Update

Run `node .testatlas/scripts/update-brain-after-command.js --command core-init --actor agent --summary "Workspace initialized (V2)" --reindex`. The `--reindex` flag triggers `index-artifacts.js` so brain counts reflect the on-disk state from the very first command.

## What's Next

- `/atlas:core-status` — confirm the new workspace state.
- `/atlas:validate-workspace` — confirm V1 schemas + manifest are clean before any exploration.
- `/atlas:core-brain-validate` — confirm V2 brain integrity.
- `/atlas:explore` — start mapping the product (umbrella router; spawns sub-explorers in parallel when `subagent-spawn` is available).
- `/atlas:bootstrap` — re-load the constitution if you suspect context drift.
- `/atlas:create-persona` — author new system or project personas for V2 council protocols.
