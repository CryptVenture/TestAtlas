---
description: Remove the TestAtlas suite tree (`.testatlas/`) per the install manifest; with `--purge`, also remove the `_testatlas/` workspace. Operator-confirmed; never runs without explicit invocation.
mode: primary
permission:
  edit:
    "_testatlas/**": allow
    ".testatlas/**": deny
    "*": ask
  bash: allow
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/uninstall.md" hash="f188f0055e3c59f10251375deba16f51a132c1bb0b6fdf05f323c5d17d928a82" -->
First read `.testatlas/bootstrap.md`. Then read `.kilocode/workflows/atlas-uninstall.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Cleanly remove the TestAtlas suite tree from the target repository, optionally including the `_testatlas/` workspace under `--purge`. Manifest-driven: only files recorded in `.testatlas/.install-manifest.json` are removed by default. Operator-confirmed in every interactive scenario; non-interactive runs that would destroy state MUST exit cleanly rather than guess. This command is non-finding-producing.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution.
- `.testatlas/.install-manifest.json` — the manifest of suite-installed files.
- `_testatlas/11_workspace_manifest.json` — workspace state (read-only here unless `--purge`).
- `_testatlas/.lock` (if it exists) — UPDATE-06-style in-flight-run detector.

## Required Actions

1. **Preferred path (if `shell` is available):** run `node .testatlas/scripts/uninstall.js [--target <path>] [--purge] [--force-untracked] [--dry-run]`. The script is manifest-driven, refuses without `--force-untracked` when the manifest is missing/invalid, removes only tracked paths by default, and additionally removes `_testatlas/` only under `--purge`. **NEVER pass `--purge` without explicit operator confirmation** — that flag destroys evidence, runs, issues, and reports. Always run with `--dry-run` first to surface the removal plan; require operator approval before re-running without `--dry-run`.
2. **Manual path (no `shell`):** read `.testatlas/.install-manifest.json` and remove each tracked path manually. If the manifest is missing/invalid, halt — do NOT blindly remove `.testatlas/`; surface the missing-manifest condition for operator review. To remove `_testatlas/` (workspace), require explicit operator confirmation; the workspace contains accumulated evidence + issues + runs and is not regenerable.
3. **Workspace lockfile check.** If `_testatlas/.lock` exists, halt with `In-flight test run detected; cannot uninstall.` Forcing past this corrupts evidence chains.
4. **Operator confirmation.** Present the removal plan (paths to remove, byte counts, whether `--purge` was requested). Require explicit operator confirmation. **NEVER auto-confirm.** Non-interactive runs MUST exit cleanly with `Uninstall requires operator confirmation; rerun interactively.`
5. **Manifest self-removal (bootstrap-phase).** After removing every path in `manifest.files`, `uninstall.js` removes `.testatlas/.install-manifest.json` itself as the final tracked-file step (`.testatlas/scripts/uninstall.js:203-212`). The manifest cannot list itself in its own file array — this is an intentional bootstrap-phase write owned by the uninstaller, not a manifest entry. Operators reviewing the removal plan with `--dry-run` will not see the manifest path in the dry-run output, but the live run does remove it.
6. Surface the runtime exit code verbatim. Do not attempt rollback — uninstall.js owns the destructive operation.
7. Close the lifecycle (next section).

## Outputs

- Removed `.testatlas/` tree (default) or `.testatlas/` + `_testatlas/` (under `--purge`).
- `_testatlas/history/uninstall-<ts>.md` recording the operation outcome (only if workspace remains, i.e. `--purge` was not used).

## Lifecycle

When `--purge` is NOT used (workspace remains), update these in PRD §40 order:

- `_testatlas/03_execution_status.md` — record uninstall outcome.
- `_testatlas/09_artifact_index.md` — re-derive (suite tree gone; workspace remains).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json`.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; record `suiteUninstalled: true` if the schema admits it (otherwise narrative-only).
- `_testatlas/history/run_log.md` — narrative entry: "Suite uninstalled; workspace preserved at `_testatlas/`."

When `--purge` IS used, no lifecycle updates are possible (workspace is gone). The runtime emits a final stdout summary the operator captures externally.

## Stop Conditions

- Manifest missing/invalid AND `--force-untracked` not passed → halt; refuse to nuke an untracked tree.
- `_testatlas/.lock` present → halt; in-flight test run.
- Operator declines confirmation → exit cleanly.
- `uninstall.js` exits non-zero → halt; surface the error verbatim.
- Would write outside `.testatlas/` (default) or `.testatlas/` + `_testatlas/` (under `--purge`) → halt; refuse out-of-bounds writes.

## Completion Criteria

- Suite tree (and optionally workspace under `--purge`) removed cleanly with explicit operator confirmation.
- Lifecycle files updated when workspace remains.
- Zero stop conditions triggered without surfacing.

## What's Next

The repo no longer contains TestAtlas. After re-running `npx @webventures/testatlas init`:

- **`/atlas:core-init`** — recreate the `_testatlas/` workspace tree
- **`/atlas:bootstrap`** — reload the constitution after reinstall
- **`/atlas:validate-workspace`** — confirm the freshly reinstalled tree is clean
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
