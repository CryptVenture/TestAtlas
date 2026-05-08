---
description: Migrate a V1 TestAtlas workspace to V2 via `.testatlas/scripts/v2-migrate.js`. Backs up the existing workspace, creates V2 brain + agent + maps + stories + tests directories, populates baseline brain JSON, and bumps the manifest. Idempotent and rollback-safe.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/maintain/maintain-migrate.md" hash="2140de6d90859919c9363fbf77fd91e84b72375576143eb1197a885eaa877048" -->
First read `.testatlas/bootstrap.md`. Then read `.claude/commands/atlas-maintain-migrate.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Upgrade an installed TestAtlas workspace from V1 to V2. V2 introduces the
multi-agent quality intelligence brain (per Phase 14): brain JSON indexes,
the personas + councils tree, knowledge maps, user stories, generated
automation, and retest packs. V1 content is preserved verbatim — V2 simply
adds new directories and baseline JSON without touching existing files.

The migration is idempotent: re-running on an already-V2 workspace
produces a no-op success. Always safe to retry.

## When to Run

- After updating to a TestAtlas suite version ≥ 2.0.0 on an existing V1 workspace.
- During CI bootstrap of a fresh V1 workspace that needs V2 capabilities.
- After `validate-workspace` reports `schema_version: 1.x` mismatches.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/11_workspace_manifest.json` — confirms workspace existence and current `schema_version`.
- `.testatlas/schemas/manifest.schema.json`

## Required Actions

1. **Backup first (always).**
   - Before any write, run `cp -a _testatlas _testatlas.bak.<ISO8601-fs-safe>` (or the
     equivalent `tar -czf _testatlas.bak.<ISO8601-fs-safe>.tar.gz _testatlas`),
     where `<ISO8601-fs-safe>` is the current ISO-8601 timestamp with `:` and `.`
     replaced by `-` (filesystem-safe form, matching `v2-migrate.js`). Example:
     `_testatlas.bak.2026-05-08T12-34-56-789Z`. The backup path MUST be reported
     in the run output so the operator can reference it for rollback.
   - The migration script tolerates missing backups but the operator SHOULD
     always pre-create one. CI flows can pin a deterministic timestamp.
2. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/v2-migrate.js [--workspace <path>] [--cwd <path>] [--force]`.
   - The script:
     - Detects V1 workspace (`schema_version: 1.x` in
       `11_workspace_manifest.json`).
     - Creates V2 directories: `bootstrap/`, `brain/`, `brain/schema/`,
       `agents/personas/{system,generated,project}/`, `agents/councils/{council_templates,sessions,transcripts,outputs,consolidations}/`,
       `agents/{handoffs,outputs,scorecards}/`, `maps/`, `stories/`,
       `tests/{generated_automation,retest_packs}/`.
     - Populates baseline brain JSON files with `schema_version: 2.0.0`.
     - Bumps `_testatlas/11_workspace_manifest.json` `schema_version` to `2.0.0`.
   - On success, the script prints the new workspace state, the count of
     created files, and (if it created one) the backup path.
   - On error, halt and surface the script exit code; the backup remains
     in place.
3. **Fallback path (no `shell`):**
   - Hand-create the V2 directory tree using the list above.
   - Hand-author `_testatlas/brain/manifest.json` with `schema_version: 2.0.0` per the schema.
   - Manually bump `_testatlas/11_workspace_manifest.json` `schema_version`.
4. Append a brain event with `command: maintain-migrate` recording the from/to schema versions and the backup path.
5. Close the lifecycle.

## Allowed Tools

- filesystem (read+write under `_testatlas/`)
- shell (preferred path; `node`, `cp`, `tar`)
- file-write (creating V2 baseline brain JSON and the backup tarball)

## Capability Degradation

`shell` unavailable → use the fallback path. The hand-built tree MUST match the V2 directory list above and the baseline brain JSON MUST validate against `manifest.schema.json` (V2). Without `shell`, no backup tarball is possible — the operator MUST take a workspace snapshot in their own tooling before applying the migration.

## Backup + Rollback

- **Backup** — always taken before mutation. Path is `_testatlas.bak.<ISO8601-fs-safe>` (directory copy) or `_testatlas.bak.<ISO8601-fs-safe>.tar.gz` (tarball), where `<ISO8601-fs-safe>` is the ISO-8601 timestamp with `:` and `.` replaced by `-` (e.g. `2026-05-08T12-34-56-789Z`) — the form `v2-migrate.js` produces. The migration run record cites the backup path so it can be located later.
- **Rollback** — to revert: stop any running TestAtlas commands, remove the migrated `_testatlas/` directory, and restore from the backup (`mv _testatlas.bak.<ISO8601-fs-safe> _testatlas` or `tar -xzf _testatlas.bak.<ISO8601-fs-safe>.tar.gz`). After rollback, `validate-workspace` should report a clean V1 state.
- **Re-running** the migration after rollback is safe — the script is idempotent.

## Outputs

- New V2 directory tree + baseline brain JSON files under `_testatlas/`.
- `_testatlas/11_workspace_manifest.json` bumped to `schema_version: 2.0.0`.
- Backup tarball or directory at `_testatlas.bak.<ISO8601-fs-safe>(.tar.gz)?` (timestamp with `:` and `.` replaced by `-`, per `v2-migrate.js`).
- Brain event + lifecycle close.

## Stop Conditions

The script does NOT halt with named error codes for the common no-op paths — instead it returns a status string and exits 0:

- **Workspace missing** (no `11_workspace_manifest.json`) → script returns `{ status: 'no-workspace' }` and exits 0 with `v2-migrate: no-workspace at <wsDir> (0 files created)` on stdout. This is a successful no-op, not a halt; the operator should run `/atlas:core-init` first if a workspace is expected.
- **Already V2** (manifest `schema_version === '2.0.0'`) AND `--force` not passed → script enters repair mode, backfills any missing V2 artifacts, and returns `{ status: 'already-v2' }` (zero files added) or `{ status: 'repaired' }` (some files added). Exit 0 in both cases — not a halt.

The script DOES halt (non-zero exit, error printed to stderr as `v2-migrate: <CODE> — <message>`) for:

- **Destructive-fs capability denied** → throws with `err.code = 'CAPABILITY_DENIED'`. Triggered when the user's config blocks destructive filesystem operations and a real migration (not a no-op) would need to write a backup.
- **Backup `cp` failure** → propagates the underlying `node:fs/promises` error (no custom code; surfaces as `ERROR — <fs message>`). The script exits 1 BEFORE writing any V2 files.
- **Any other unhandled error** → printed as `v2-migrate: <err.code ?? 'ERROR'> — <err.message>` and exit 1.

## Lifecycle

Run `node .testatlas/scripts/update-brain-after-command.js --command maintain-migrate --actor "atlas-agent" --summary "Migrated workspace from V1 to V2 (or no-op if already V2)" --status completed` (or `--status aborted` with the error code). The standard 5 lifecycle artifacts are updated by the hook.

## What's Next

Now that the workspace has migrated to V2:

- **`/atlas:core-brain-validate`** — confirm the migrated workspace's brain layer is intact.
- **`/atlas:core-status`** — refresh the V2 status snapshot for the migrated workspace.
- **`/atlas:explore`** — re-run exploration on the V2 layout.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
