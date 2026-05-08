---
mode: agent
description: Audit the V2 brain workspace consistency — stale docs, invalid JSON, missing indexes, dangling cross-references, drift between markdown and JSON, orphaned evidence.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-brain.md" hash="afe41957ee004c92bc707316b1d0deccf4432434fd315fae0f55da77f8fb8519" -->
First read `.testatlas/bootstrap.md`. Then read `.github/prompts/atlas-explore-brain.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Audit the V2 brain workspace for consistency:
- **Stale docs:** markdown files older than their backing JSON, or JSON last-updated stamps older than the file system mtime.
- **Invalid JSON / JSONL:** files that fail AJV validation or `JSON.parse`.
- **Missing indexes:** brain index files that reference non-existent artifacts, or artifacts on disk missing from the brain index.
- **Dangling cross-references:** `requires` / `affects` / `causedBy` / `evidenceRef` IDs that point to non-existent records.
- **Markdown↔JSON drift:** `<!-- TESTATLAS:GENERATED -->` blocks not synced with the JSON source.
- **Orphaned evidence:** files under `_testatlas/evidence/` not cited by any artifact.

This command runs read-only audits and surfaces findings; it never auto-fixes. Use `/atlas:core-brain-sync` (V2 core command) or hand-edit to resolve.

## Required First Reads

- `.testatlas/bootstrap.md` — §4 (capability degradation), §8 (no-evidence-no-finding), §11 (brain integrity).
- `_testatlas/brain/manifest.json` — schema versions, file enumeration.
- `_testatlas/brain/state.json` — counts vs reality.
- `.testatlas/schemas/*` — full schema set for AJV validation.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `shell` to invoke `node .testatlas/scripts/validate-brain.js` and walk the workspace tree. If unavailable, degrade to a single-file scan starting at `manifest.json`. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: shell`.

3. **Phase 1 — Validation sweep.** Invoke `node .testatlas/scripts/validate-brain.js --suite-cwd <repo-root>`. Capture stdout/stderr to `evidence/validate-brain.txt`. Each finding from `validate-brain.js` (`BRAIN_DIR_MISSING`, `BRAIN_FILE_MISSING`, `BRAIN_JSON_PARSE_ERROR`, `BRAIN_JSONL_PARSE_ERROR`, `BRAIN_REQUIRED_FIELD_MISSING`, `BRAIN_SCHEMA_VIOLATION`) becomes a row in the audit report.

4. **Phase 2 — Stale-doc detection.** For each pair `(domains/<slug>/domain.md, domains/<slug>/domain.json)`, `(flows/<slug>/flow.md, flow.json)`, `(to_fix/<id>/issue.md, issue.json)`:
   - Compare file mtimes.
   - Compare `last_updated` field (when present in the JSON) against file mtime.
   - Flag pairs where md mtime > json mtime + 60s OR json `last_updated` < (now - 30 days) as stale.
   - Append to `evidence/stale.json` with `{path, mdMtime, jsonMtime, jsonLastUpdated}`.

5. **Phase 3 — Index consistency.** For each brain index (`brain/{domains,flows,issues,evidence,personas,decisions}.json`):
   - Walk the corresponding artifact directory under `_testatlas/`.
   - Find IDs in the index not present on disk (dangling-in-index).
   - Find IDs on disk not present in the index (missing-from-index).
   - Append to `evidence/index-drift.json`.

6. **Phase 4 — Cross-reference resolution.** Walk every artifact JSON and resolve every cross-ref field (`requires`, `affects`, `causedBy`, `evidenceRefs`, `relatedClaimIds`, `routeCoverage`, etc.) against the brain index. Unresolved refs become dangling-ref findings. Append to `evidence/dangling-refs.json` with `{from, fieldName, targetId}`.

7. **Phase 5 — Generated-block drift.** For each markdown with a `<!-- TESTATLAS:GENERATED:START section="X" -->...<!-- TESTATLAS:GENERATED:END section="X" -->` block, recompute the expected content from the JSON source by invoking `node .testatlas/scripts/sync-markdown-json.js --dry-run`. Diff the dry-run output against the on-disk markdown. Append diffs to `evidence/generated-drift.json`.

   **About `--dry-run` (supported as of Phase 20).** The accelerator's `--dry-run` flag is a no-mutation preview pass: the script reports planned writes to stdout but performs **no** `atomicWrite`, no rename, and no `fs.writeFile` — the workspace is guaranteed unchanged when this flag is passed. Output shape:

   ```
   DRY RUN — no files were modified.
   Planned writes: <n>
     <absolute-path-1>
     <absolute-path-2>
     ...
   ```

   `<n>` is the count of brain index files (e.g. `brain/domains.json`) that would be rewritten if the script ran without `--dry-run`. An audit-only pass during this command MUST use `--dry-run` so the read-only audit boundary holds. Default (no flag) mutates brain index files.

   Examples:

   ```
   # Preview (audit-safe — no mutation):
   node .testatlas/scripts/sync-markdown-json.js --dry-run --cwd .

   # Apply (mutates brain index files — used by /atlas:core-brain-sync, NOT this command):
   node .testatlas/scripts/sync-markdown-json.js --cwd .
   ```

8. **Phase 6 — Orphaned evidence.** Walk `_testatlas/evidence/`. For each file, search `brain/evidence.json` and every artifact JSON for a citation. Files not cited anywhere are orphans. Append to `evidence/orphans.json`.

9. **Aggregate report.** Synthesize findings into `evidence/audit-report.md` with sections: validation findings, stale docs, index drift, dangling refs, generated-block drift, orphans. Sort by severity (failed validation > dangling refs > stale > orphans).

10. **Persist + write.** This command is read-only — it writes only to `_testatlas/evidence/explore-brain/<timestamp>/` and the lifecycle files. If the audit yields zero findings, still write an empty `audit-report.md` recording the all-clear timestamp.

11. Close the lifecycle.

## Outputs

- `_testatlas/evidence/explore-brain/<timestamp>/` — `validate-brain.txt`, `stale.json`, `index-drift.json`, `dangling-refs.json`, `generated-drift.json`, `orphans.json`, `audit-report.md`.
- No mutations to brain files; remediation is `/atlas:core-brain-sync` or hand-edit.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, audit-report path, finding counts by category.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidenceRecords`.
- `_testatlas/history/run_log.md` — narrative: "Audited brain — `<n>` validation findings / `<s>` stale / `<d>` dangling refs / `<o>` orphans in `_testatlas/evidence/explore-brain/<ts>/`."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-brain --actor agent --summary "Audited brain consistency and surfaced drift signals" --status completed`. Do NOT pass `--reindex` from this command — `index-artifacts.js` is what `/atlas:core-brain-sync` runs and would mask drift this audit just surfaced.

<!-- Capability/stop reconciled per Round-12 Class E (Quick 260508-u72) -->
## Stop Conditions

- `_testatlas/brain/` does not exist → halt: "Run `/atlas:core-init --mode upgrade` first."
- Any captured artifact path fails to materialize on disk → halt; this command itself must produce real evidence.

(Missing `shell` is NOT a halt condition — it triggers the degrade path documented in Required Action 2: single-file scan starting at `manifest.json`, with every finding marked `confidence: needs-validation` and `tool_unavailable: shell`.)

## Completion Criteria

- Six audit-phase outputs all written under the timestamped evidence dir.
- `audit-report.md` synthesizes findings (or records all-clear).
- The 5 lifecycle files updated.
- `update-brain-after-command.js` ran (without `--reindex`).

## What's Next

- **`/atlas:core-brain-sync`** — apply remediations for stale docs and generated-block drift.
- **`/atlas:core-brain-validate`** — run full AJV validation if this audit pointed at schema violations.
- **`/atlas:explore-release-readiness`** — incorporate brain audit results into release decision.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
