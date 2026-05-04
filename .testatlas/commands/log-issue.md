---
command: log-issue
version: 1.0.0
description: Capture a quality finding as an issue under to_fix/ with severity, confidence, evidence references, and back-links to flows/domains per PRD §17.
capabilities: [file-write]
produces:
  - issue
  - evidence
consumes:
  - workspace-manifest
  - issue
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT modify target-repo source files. Does NOT log an issue with empty evidence array — refuse and surface a stop condition. Does NOT classify severity above what evidence supports.
---

# TestAtlas Command: log-issue

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

Capture a quality finding (functional bug, regression, accessibility issue, performance regression, etc.) as a structured issue artifact under `_testatlas/to_fix/` with markdown + JSON sidecar per PRD §17, including severity, confidence, evidence references, and domain/flow back-links. Issues are the primary unit of value the framework produces; they must be reproducible, evidence-backed, and traceable to the flow or domain that surfaced them.

## Required First Reads

- `.testatlas/bootstrap.md` (especially §8 — no-evidence-no-finding rule).
- `.testatlas/vocabulary.json` — `severity`, `confidence`, `issueStatus`, and `issueType` `$defs` (the only allowed values).
- `.testatlas/schemas/issue.schema.json` — required JSON shape this command must satisfy.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.
- `_testatlas/11_workspace_manifest.json` — current `counts.issues` for next-ID allocation.
- The relevant `_testatlas/domains/<slug>/` and `_testatlas/flows/<slug>/` directories for back-references.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
2. Verify each evidence file exists on disk via direct read — not just by reference. If the resulting `evidence: []` array would be empty, REFUSE to log the issue and surface a stop condition per `bootstrap.md` §24. The framework would rather have zero issues than a fabricated one.
3. Determine **severity** from PRD §28 — exactly one of: `critical`, `high`, `medium`, `low`, `enhancement`. Severity reflects user impact + reach + reversibility, not technical complexity. A typo in a marketing footer is `low`; a payment-flow data-loss bug is `critical`. Never inflate; never deflate.
4. Determine **confidence** from PRD §28 — exactly one of: `confirmed`, `strong-suspect`, `needs-validation`. If you reproduced the failure first-hand against running product behavior with captured evidence, `confirmed`. If you have indirect evidence (logs, third-party reports, partial repro), `strong-suspect`. If you suspect a defect but cannot verify (e.g., `shell` or `browser` capability unavailable for repro), `needs-validation`.
5. Determine **issue type** per `.testatlas/vocabulary.json` `$defs.issueType`: one of `functional`, `regression`, `ux`, `copy`, `accessibility`, `performance`, `reliability`, `state`, `validation`, `integration` (full enum lives in `vocabulary.json`).
6. Allocate the next issue ID per PRD §32 — zero-padded format `ISSUE-0001`, `ISSUE-0002`, etc. Read the manifest's `counts.issues`, increment by one, then verify no on-disk file at that ID already exists (manifest-corruption check).
7. Write the issue pair: `_testatlas/to_fix/ISSUE-<id>-<slug>.md` (human-readable) and `_testatlas/to_fix/ISSUE-<id>-<slug>.json` (schema-validated sidecar). Required fields per `issue.schema.json`: `id`, `slug`, `title`, `description`, `severity`, `confidence`, `type`, `status` (set to `new`), `domain`, `flow` (optional), `evidence` (non-empty array of paths under `_testatlas/evidence/`), `foundAt` (ISO-8601 UTC), `reproSteps`, `expected`, `actual`.
8. Add back-references: append the issue ID to `_testatlas/domains/<domain-slug>/issues.md` (per-domain index) and to `_testatlas/flows/<flow-slug>/issues.md` if a flow is named.
9. Update the cross-cut indexes: `_testatlas/to_fix/by_severity/<severity>.md` and `_testatlas/to_fix/by_status/new.md`. These are the views operators read first.
10. Validate the new JSON sidecar against `issue.schema.json` before closing. If validation fails, halt — do not partially commit a malformed issue.
11. Close the lifecycle (next section).

## Outputs

- `_testatlas/to_fix/ISSUE-<id>-<slug>.md` — human-readable issue document with repro steps, expected vs. actual, evidence links.
- `_testatlas/to_fix/ISSUE-<id>-<slug>.json` — schema-validated JSON sidecar matching `issue.schema.json`.
- Updated per-domain index `_testatlas/domains/<domain-slug>/issues.md`.
- Updated per-flow index `_testatlas/flows/<flow-slug>/issues.md` (when applicable).
- Updated cross-cut indexes under `_testatlas/to_fix/by_severity/` and `_testatlas/to_fix/by_status/`.
- New evidence sidecar files under `_testatlas/evidence/` if any were referenced but not yet recorded.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the new issue ID + severity.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the issue ID.
- `_testatlas/11_workspace_manifest.json` — increment `counts.issues`; bump `lastUpdatedAt`.
- `_testatlas/history/run_log.md` — narrative entry: "Logged ISSUE-`<id>` (`<severity>`/`<confidence>`) against `<domain>` / `<flow>`."

## Stop Conditions

- Empty evidence array → REFUSE to log; surface "no-evidence-no-finding" stop condition per `bootstrap.md` §24. The agent MUST stop and return to evidence-gathering before retrying.
- Evidence file referenced but not present on disk → halt; do not log a fabricated path.
- Issue ID collision with manifest → recompute the next ID; if collision persists after recompute, halt — manifest is corrupt and `validate-workspace` must run first.
- Severity claim above what evidence supports → downgrade or refuse. Per `bootstrap.md` §8, agents may not inflate impact to attract attention.
- `issue.schema.json` validation fails on the produced JSON → halt; do not commit a partial / malformed issue.

## Completion Criteria

- The issue file pair exists at `_testatlas/to_fix/ISSUE-<id>-<slug>.{md,json}`.
- The JSON sidecar validates against `issue.schema.json`.
- Per-domain, per-flow, per-severity, and per-status indexes are updated.
- Manifest `counts.issues` was incremented by exactly one.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the issue is filed:

- **`/atlas:triage`** — assess severity, owner, and fix priority across the issue queue
- **`/atlas:retest`** — re-run the failing scenario after a candidate fix is in place
- **`/atlas:report`** — fold the issue into the next aggregate report
