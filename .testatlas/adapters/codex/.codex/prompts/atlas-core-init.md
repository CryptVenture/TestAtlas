<!-- TestAtlas command: atlas-core-init. Invoke as /prompts:atlas-core-init. Description: Bootstrap or upgrade a TestAtlas V2 workspace — creates `_testatlas/brain/` skeleton, registers adapters, and writes a v2 manifest. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/core/init.md" hash="2f997161bf3eeeebc835dd7fc5f83accc38a9234a206f8732a6356176944e7fd" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-core-init.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Bring a target repository to a clean V2 baseline — `_testatlas/` directory tree (canonical V1 files preserved) PLUS the V2 brain skeleton (`_testatlas/brain/` with 23 files: 20 JSON + 3 JSONL). On an existing V1 workspace, run in `--mode upgrade` to ADD the brain skeleton without removing V1 artifacts.

## Required First Reads

- `.testatlas/bootstrap.md`
- `.testatlas/default.config.json`
- The target repository's `package.json` / `pyproject.toml` / `Cargo.toml` for runtime detection.

## Required Actions

1. **Preferred path (if `shell`):** run `node .testatlas/scripts/init-workspace.js` from the target repo root. The script is idempotent — fresh repos report `status: initialized`; previously-V1 repos run additive V2 upgrade with `status: partial-fill`. After init, `node .testatlas/scripts/sync-status.js` reconciles `_testatlas/03_execution_status.md` AND `_testatlas/00_overview.md` generated sections from manifest counts in one call. **Idempotency note:** on already-initialized repos where on-disk counts match the manifest and overview sections are already current, `sync-status.js` is a no-op and produces no on-disk writes (`manifestChanged=false`, `statusUpdated=false`, `overviewUpdated=false` — see `.testatlas/scripts/sync-status.js:218-231`).
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
- 14 V1 canonical markdown files (already shipped); 23 V2 brain files (20 JSON + 3 JSONL).
- `_testatlas/11_workspace_manifest.json` (V1) and `_testatlas/brain/manifest.json` (V2).
- V2 brain files written by `init-workspace.js` (20 JSON + 3 JSONL = 23 total):
  - `_testatlas/brain/manifest.json`
  - `_testatlas/brain/state.json`
  - `_testatlas/brain/domains.json`
  - `_testatlas/brain/flows.json`
  - `_testatlas/brain/routes.json`
  - `_testatlas/brain/components.json`
  - `_testatlas/brain/commands.json`
  - `_testatlas/brain/personas.json`
  - `_testatlas/brain/issues.json`
  - `_testatlas/brain/evidence.json`
  - `_testatlas/brain/risks.json`
  - `_testatlas/brain/assumptions.json`
  - `_testatlas/brain/open_questions.json`
  - `_testatlas/brain/decisions.json`
  - `_testatlas/brain/coverage.json`
  - `_testatlas/brain/quality_scores.json`
  - `_testatlas/brain/agent_sessions.json`
  - `_testatlas/brain/drift.json`
  - `_testatlas/brain/embeddings_manifest.json`
  - `_testatlas/brain/graph.json`
  - `_testatlas/brain/claims.jsonl`
  - `_testatlas/brain/observations.jsonl`
  - `_testatlas/brain/events.jsonl`
- `_testatlas/brain/schema/` — schemas mirrored from `.testatlas/schemas/` for offline validation.
- Lifecycle close + brain event.

<!-- Stop codes verified against `.testatlas/scripts/init-workspace.js` (Round-12, Quick 260508-u72) -->

## Stop Conditions

- `.testatlas/bootstrap.md` missing → halt with `TESTATLAS_SUITE_MISSING` (`.testatlas/scripts/init-workspace.js:163-170`); run `npx @webventures/testatlas init` first.
- Existing `_testatlas/` directory present without an `11_workspace_manifest.json` (ambiguous workspace) → halt with `TESTATLAS_AMBIGUOUS_WORKSPACE` (`.testatlas/scripts/init-workspace.js:190-197`); pass `--force` to recreate. Note: `--force` ONLY resolves the ambiguous-workspace error code (the script consumes `--force` at the missing-manifest check on line 190 and nowhere else); the script does NOT inspect an existing manifest for validity, so manifest-validation failures on an existing workspace must be addressed by manual repair (review the failing AJV report from `node .testatlas/scripts/validate-workspace.js`), not by `--force`.
- Generated manifest schema definition cannot be loaded → halt with `TESTATLAS_SCHEMA_MISSING` (`.testatlas/scripts/init-workspace.js:273-277`).
- Generated manifest fails schema validation against `workspace-manifest.schema.json` → halt with `TESTATLAS_INVALID_MANIFEST` and surface the AJV error report verbatim (`.testatlas/scripts/init-workspace.js:279-285`).
- Target repo path is not writable → halt; never proceed silently. (No dedicated stop code; an underlying `EACCES`/`EROFS` from `node:fs/promises` propagates.)
- `safeMode: true` AND any required step would mutate target-repo source files → halt; only `_testatlas/` is writable. (Enforced by the agent runner, not by `init-workspace.js`.)

## Lifecycle

<!-- ISSUE-162 (Quick 260508-u72): merged the previously-duplicated ## Lifecycle -->
<!-- sections into a single canonical section. PRD §40 artifact list + brain-update -->
<!-- hook now live together; INV-F (PLAN-20 duplicate-section-headings) clean. -->

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute counts.
- `_testatlas/history/run_log.md` — narrative log entry for this run.

Then run `node .testatlas/scripts/update-brain-after-command.js --command core-init --actor agent --summary "Workspace initialized (V2)" --reindex`. The `--reindex` flag triggers `index-artifacts.js` so brain counts reflect the on-disk state from the very first command.

## Completion Criteria

- `_testatlas/11_workspace_manifest.json` validates and records `status: initialized` (or `partial-fill` for upgrade).
- `_testatlas/brain/manifest.json` validates against `manifest.schema.json` (V2).
- All 22 V2 brain files present.
- Lifecycle artifacts updated.
- A `command_completed` event recorded.

## What's Next

- `/atlas:core-status` — confirm the new workspace state.
- `/atlas:validate-workspace` — confirm V1 schemas + manifest are clean before any exploration.
- `/atlas:core-brain-validate` — confirm V2 brain integrity.
- `/atlas:explore` — start mapping the product (umbrella router; spawns sub-explorers in parallel when `subagent-spawn` is available).
- `/atlas:bootstrap` — re-load the constitution if you suspect context drift.
- `/atlas:create-persona` — author new system or project personas for V2 council protocols.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
