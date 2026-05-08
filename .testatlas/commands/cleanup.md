---
command: cleanup
version: 1.0.0
description: Workspace housekeeping confined to _testatlas/ — orphan removal, broken-link triage, stale-marker resolution, index re-derivation. Never deletes user content.
capabilities: [shell, file-write]
produces:
  - command-result
consumes:
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: NEVER deletes user-authored content. NEVER mutates content outside `<!-- TESTATLAS:GENERATED:START ... -->` markers. NEVER touches `.testatlas/` (suite layer). Operates exclusively on `_testatlas/` (workspace layer) per the WORK-06 two-tree invariant.
---

# TestAtlas Command: cleanup

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `./_testatlas/11_workspace_manifest.json` if it exists.
4. Inspect the canonical files required by this command.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Perform workspace housekeeping confined to `_testatlas/` per the WORK-06 two-tree invariant: enumerate orphan artifacts, surface broken cross-file links, resolve stale generated-section markers, and re-derive the artifact index and manifest counts so they match disk truth. The output is a `cleanup-report-<ts>.md` listing actions taken plus items requiring human review. This command is non-finding-producing: it manages workspace hygiene, not findings. The cardinal rule is: **NEVER deletes user-authored content.** When in doubt, propose for review rather than auto-act.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution; the two-tree invariant.
- `_testatlas/11_workspace_manifest.json` — current counts to reconcile against disk.
- `_testatlas/09_artifact_index.md` — current artifact list to re-derive.
- The relevant `_testatlas/to_fix/`, `_testatlas/evidence/`, `_testatlas/tests/runs/`, `_testatlas/domains/`, `_testatlas/flows/`, and `_testatlas/handoffs/` directories — the artifact populations subject to housekeeping.

## Required Actions

1. **Preferred path (if `shell` is available):** the cleanup workflow ships three composable accelerators:
   - `node .testatlas/scripts/update-indexes.js [--only=...]` — regenerates the on-disk-derived sections of `09_artifact_index.md` from live workspace truth, preserving human prose outside `<!-- TESTATLAS:GENERATED -->` markers (refuses on malformed markers — `TESTATLAS_MARKER_INVALID`).
   - `node .testatlas/scripts/normalize-slugs.js [--apply]` — without `--apply` prints a rename plan for mis-slugged artifacts under `to_fix/`, `flows/`, `domains/`, `evidence/`, `reports/`, `tests/runs/`. With `--apply` performs the renames AND updates index references via the same markers parser. Run without `--apply` first; only `--apply` after operator confirms.
   - `node .testatlas/scripts/check-stale-docs.js [--threshold-days <n>] [--report <path>]` — flags markdown files older than threshold (default 90 days). Honors `archival: true` frontmatter and `config.staleDocs.archivalDirs` (default `['history']`). Output is informational; cleanup never auto-archives stale docs.

   Capture stdout from each invocation into the cleanup-report. Skip steps 4–8 below for items the scripts handled. **Manual path (no `shell`):** items 2–11 below describe each step the runtime performs.
2. Verify `file-write` capability is available. Halt cleanly and report if absent.
3. **Two-tree invariant check (verbatim)**: this command operates exclusively on `_testatlas/`. NEVER touches `.testatlas/`. Halt immediately if any planned operation would write to `.testatlas/`. The suite layer is owned by the installer; the workspace layer is owned by the agent.
4. **Enumerate orphan artifacts.** Walk `_testatlas/` and identify files not referenced by any index: an issue under `to_fix/` not listed in any per-severity / per-status / per-domain index; an evidence file under `evidence/` not referenced by any issue or run; a run record under `runs/` not present in the artifact index. Record each orphan with its path and the index it should appear in.
5. **Enumerate broken links.** Read every markdown file under `_testatlas/` and resolve each repository-relative cross-reference. A link whose target does not exist on disk is a broken link. Record the source file, line number, and dangling path.
6. **Enumerate stale generated-section markers.** For each pair of `<!-- TESTATLAS:GENERATED:START id="..." hash="..." -->` and `<!-- TESTATLAS:GENERATED:END id="..." -->` markers (per the Phase 2 markers parser), verify that the START/END pair is well-formed and that the recorded `hash` matches the current content. Record orphan starts, orphan ends, mismatched IDs, and hash mismatches separately.
7. **Repair mode (default safe).** Apply only operations that cannot lose user content:
   - Orphan artifact → re-link from the appropriate index if a logical home exists; otherwise list the artifact for operator review. Never delete the file.
   - Broken link → list in the cleanup report for operator review. Never auto-fix without operator confirmation; the correct target may be elsewhere or the link may indicate a missing artifact that should be authored.
   - Well-formed generated-section marker pair → re-render the generated content between the markers while preserving all bytes outside markers (per the markers parser semantics). The accelerator (`update-indexes.js`) regenerates section bodies **unconditionally**: any human edits made *inside* a `<!-- TESTATLAS:GENERATED -->` block will be replaced. The manifest's `generatedSections[<file>][<section>]` hash is updated to the freshly rendered body — it records the last render and is **not** consulted to skip re-renders. Operators must keep human-authored prose strictly outside markers.
   - Orphan / malformed markers (orphan START, orphan END, mismatched section attribute, missing END at EOF, nested START, duplicate section) → the accelerator throws `TESTATLAS_MARKER_INVALID` and **halts the entire run**, refusing to write any section of `09_artifact_index.md`. The operator must hand-repair the marker pair before re-running cleanup; the accelerator does not produce a partial-fix list.
8. **Re-derive `_testatlas/09_artifact_index.md`** from disk truth. The artifact index must reflect what exists on disk, not what was previously recorded.
9. **Reconcile `_testatlas/11_workspace_manifest.json` counts** to match the re-derived index. Bump `lastUpdatedAt`. If counts cannot be reconciled (e.g., the manifest claims more issues than exist on disk and the discrepancy cannot be explained by orphaned artifacts), halt and surface for operator review rather than silently rewrite.
10. **Write `_testatlas/cleanup-report-<ts>.md`** listing each enumerated item, the action taken (or `requires-review`), and the resulting state. The report is the durable record of this run.
11. Close the lifecycle (next section).

## Outputs

- `_testatlas/cleanup-report-<ts>.md` — list of orphans, broken links, stale markers, and the action taken for each (`re-linked`, `re-rendered`, `requires-review`).
- Updated `_testatlas/09_artifact_index.md` — re-derived from disk.
- Updated `_testatlas/11_workspace_manifest.json` — counts reconciled.
- Updated content inside `<!-- TESTATLAS:GENERATED -->` markers — section bodies are re-rendered unconditionally on every accelerator run; the manifest's `generatedSections[<file>][<section>]` hash is refreshed to the new body and is not used to skip re-renders.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record cleanup status + counts of orphans/broken-links/stale-markers found and resolved.
- `_testatlas/09_artifact_index.md` — re-derived from disk truth.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the cleanup-report path.
- `_testatlas/11_workspace_manifest.json` — counts reconciled; bump `lastUpdatedAt`.
- `_testatlas/history/run_log.md` — narrative entry: "Cleanup pass: `<n>` orphans, `<n>` broken links, `<n>` stale markers; `<n>` resolved automatically; `<n>` require review."

## Stop Conditions

- Would write to `.testatlas/` → halt immediately (two-tree invariant violation).
- Would delete user-authored content (anything outside `<!-- TESTATLAS:GENERATED -->` markers) → refuse; surface for operator review instead.
- Malformed marker pair detected by the markers parser (orphan START, orphan END, mismatched section attribute, missing END at EOF, nested START, duplicate section) → halt with `TESTATLAS_MARKER_INVALID`; refuse to write `09_artifact_index.md`. Section bodies between well-formed markers are otherwise re-rendered unconditionally — the operator is responsible for keeping human-authored content strictly outside `<!-- TESTATLAS:GENERATED -->` markers.
- Manifest counts cannot be reconciled with disk truth even after orphan accounting → halt and surface; the manifest may be corrupt and a human should review before any rewrite.
- `_testatlas/.lock` exists → halt; an in-flight test run is using the workspace.

## Completion Criteria

- Orphan artifacts, broken links, and stale markers are enumerated and either repaired safely or surfaced to the operator in `cleanup-report-<ts>.md`.
- User-authored content is untouched.
- `_testatlas/09_artifact_index.md` and `_testatlas/11_workspace_manifest.json` reflect on-disk reality.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the workspace is tidy:

- **`/atlas:update`** — pull the latest suite version on a clean tree
- **`/atlas:validate-workspace`** — confirm cleanup did not introduce new schema drift
- **`/atlas:core-brain-sync`** — re-index brain state after cleanup so brain reflects the cleaned workspace.
- **`/atlas:maintain-validate-artifacts`** — V2 cleanup completion check; validates remaining artifacts are coherent.
