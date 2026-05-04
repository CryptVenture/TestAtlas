---
description: Workspace housekeeping confined to _testatlas/ — orphan removal, broken-link triage, stale-marker resolution, index re-derivation. Never deletes user content.
allowed-tools: Read, Write, Edit, Glob, Grep
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/cleanup.md" hash="2f5c9a216ec81814" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Perform workspace housekeeping confined to `_testatlas/` per the WORK-06 two-tree invariant: enumerate orphan artifacts, surface broken cross-file links, resolve stale generated-section markers, and re-derive the artifact index and manifest counts so they match disk truth. The output is a `cleanup-report-<ts>.md` listing actions taken plus items requiring human review. This command is non-finding-producing: it manages workspace hygiene, not findings. The cardinal rule is: **NEVER deletes user-authored content.** When in doubt, propose for review rather than auto-act.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution; the two-tree invariant.
- `_testatlas/11_workspace_manifest.json` — current counts to reconcile against disk.
- `_testatlas/09_artifact_index.md` — current artifact list to re-derive.
- The relevant `_testatlas/to_fix/`, `_testatlas/evidence/`, `_testatlas/runs/`, `_testatlas/domains/`, `_testatlas/flows/`, and `_testatlas/handoffs/` directories — the artifact populations subject to housekeeping.

## Required Actions

1. Verify `file-write` capability is available. Halt cleanly and report if absent.
2. **Two-tree invariant check (verbatim)**: this command operates exclusively on `_testatlas/`. NEVER touches `.testatlas/`. Halt immediately if any planned operation would write to `.testatlas/`. The suite layer is owned by the installer; the workspace layer is owned by the agent.
3. **Enumerate orphan artifacts.** Walk `_testatlas/` and identify files not referenced by any index: an issue under `to_fix/` not listed in any per-severity / per-status / per-domain index; an evidence file under `evidence/` not referenced by any issue or run; a run record under `runs/` not present in the artifact index. Record each orphan with its path and the index it should appear in.
4. **Enumerate broken links.** Read every markdown file under `_testatlas/` and resolve each repository-relative cross-reference. A link whose target does not exist on disk is a broken link. Record the source file, line number, and dangling path.
5. **Enumerate stale generated-section markers.** For each pair of `<!-- TESTATLAS:GENERATED:START id="..." hash="..." -->` and `<!-- TESTATLAS:GENERATED:END id="..." -->` markers (per the Phase 2 markers parser), verify that the START/END pair is well-formed and that the recorded `hash` matches the current content. Record orphan starts, orphan ends, mismatched IDs, and hash mismatches separately.
6. **Repair mode (default safe).** Apply only operations that cannot lose user content:
   - Orphan artifact → re-link from the appropriate index if a logical home exists; otherwise list the artifact for operator review. Never delete the file.
   - Broken link → list in the cleanup report for operator review. Never auto-fix without operator confirmation; the correct target may be elsewhere or the link may indicate a missing artifact that should be authored.
   - Stale generated-section marker pair with valid hash → re-render the generated content while preserving the human-authored content outside markers (per the markers parser semantics). On hash mismatch (which signals a human edit inside the generated block), warn and skip — do NOT overwrite human edits.
   - Orphan markers → list for operator review; do not synthesize a missing partner.
7. **Re-derive `_testatlas/09_artifact_index.md`** from disk truth. The artifact index must reflect what exists on disk, not what was previously recorded.
8. **Reconcile `_testatlas/11_workspace_manifest.json` counts** to match the re-derived index. Bump `lastUpdatedAt`. If counts cannot be reconciled (e.g., the manifest claims more issues than exist on disk and the discrepancy cannot be explained by orphaned artifacts), halt and surface for operator review rather than silently rewrite.
9. **Write `_testatlas/cleanup-report-<ts>.md`** listing each enumerated item, the action taken (or `requires-review`), and the resulting state. The report is the durable record of this run.
10. Close the lifecycle (next section).

## Outputs

- `_testatlas/cleanup-report-<ts>.md` — list of orphans, broken links, stale markers, and the action taken for each (`re-linked`, `re-rendered`, `requires-review`).
- Updated `_testatlas/09_artifact_index.md` — re-derived from disk.
- Updated `_testatlas/11_workspace_manifest.json` — counts reconciled.
- Updated content inside `<!-- TESTATLAS:GENERATED -->` markers where hash matched and re-render was safe.

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
- Hash mismatch on a generated-section marker → warn and skip that section; do NOT overwrite suspected human edits.
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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
