---
description: Capture a quality finding as an issue under to_fix/ with severity, confidence, evidence references, and back-links to flows/domains per PRD §17.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/log-issue.md" hash="5084fb7429be7307d19ff53fd7917f941906ef42f071eccfd2ca55f2b635c04e" -->
First read `.testatlas/bootstrap.md`. Then read `.windsurf/workflows/atlas-log-issue.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Capture a quality finding (functional bug, regression, accessibility issue, performance regression, etc.) as a structured issue artifact under `_testatlas/to_fix/` with markdown + JSON sidecar per PRD §17, including severity, confidence, evidence references, and domain/flow back-links. Issues are the primary unit of value the framework produces; they must be reproducible, evidence-backed, and traceable to the flow or domain that surfaced them.

## Required First Reads

- `.testatlas/bootstrap.md` (especially §8 — no-evidence-no-finding rule).
- `.testatlas/schemas/vocabulary.schema.json` — `severity`, `confidence`, `issueStatus`, and `issueType` `$defs` (the only allowed values).
- `.testatlas/schemas/issue.schema.json` — required JSON shape this command must satisfy.
- `.testatlas/schemas/evidence.schema.json` — required shape for evidence sidecars.
- `_testatlas/11_workspace_manifest.json` — current `counts.issues` for next-ID allocation.
- The relevant `_testatlas/domains/<slug>/issues/index.md` per-domain index (per `.testatlas/scripts/create-domain.js`) and the `_testatlas/to_fix/by_flow/<flow-id>.md` per-flow index for back-references. (Note: flows themselves are file pairs `flows/FLOW-<domain>-<slug>.{md,json}` per `.testatlas/scripts/create-flow.js`, NOT directories — flow back-refs live under `_testatlas/to_fix/by_flow/`.)

## Required Actions

1. **Preferred path (if `shell` is available):** run `node .testatlas/scripts/create-issue.js --title "<title>" --domain domain-<slug> --severity <severity> --evidence EVIDENCE-<id> [--evidence ...] [--repro-steps "<step>"] [--frequency <always|intermittent|unknown>] [--acceptance-criteria "<criterion>"] [--workspace <path>] [--dry-run]`. The script is idempotent, AJV-validates the JSON sidecar against `issue.schema.json` before write, allocates the next ISSUE-<id> from manifest+disk truth, and refuses on empty evidence (matches the no-evidence-no-finding rule below). The three schema-field flags `--repro-steps` (repeat for each step), `--frequency`, and `--acceptance-criteria` (repeat for each criterion) populate the matching `issue.schema.json` required fields without hand-editing JSON. On success, the per-domain index, per-flow index, per-severity index, per-status index, and the manifest count are all updated by the script — skip steps 9, 9.5, 10, 11 below. **Manual path (no `shell`):** items 2–12 below describe each step the runtime performs; agents without shell capability hand-roll them and mark `confidence: needs-validation` per `bootstrap.md` §4.
2. **No evidence, no finding.** Per `bootstrap.md` §8, every claim this command produces MUST cite an evidence file path under `_testatlas/evidence/`. Fabricated paths fail `validate-workspace`.
3. Verify each evidence file exists on disk via direct read — not just by reference. If the resulting `evidence: []` array would be empty, REFUSE to log the issue and surface a stop condition per `bootstrap.md` §24. The framework would rather have zero issues than a fabricated one.
4. Determine **severity** from PRD §28 — exactly one of: `critical`, `high`, `medium`, `low`, `enhancement`. Severity reflects user impact + reach + reversibility, not technical complexity. A typo in a marketing footer is `low`; a payment-flow data-loss bug is `critical`. Never inflate; never deflate.
5. Determine **confidence** from PRD §28 — exactly one of: `confirmed`, `strong-suspect`, `needs-validation`. If you reproduced the failure first-hand against running product behavior with captured evidence, `confirmed`. If you have indirect evidence (logs, third-party reports, partial repro), `strong-suspect`. If you suspect a defect but cannot verify (e.g., `shell` or `browser` capability unavailable for repro), `needs-validation`.
6. Determine **issue type** per `.testatlas/schemas/vocabulary.schema.json` `$defs.issueType`: one of `functional`, `regression`, `ux`, `copy`, `accessibility`, `performance`, `reliability`, `state`, `validation`, `integration` (full enum lives in the schema).
7. Allocate the next issue ID per PRD §32 — zero-padded format `ISSUE-0001`, `ISSUE-0002`, etc. Read the manifest's `counts.issues`, increment by one, then verify no on-disk file at that ID already exists (manifest-corruption check).
8. Write the issue pair: `_testatlas/to_fix/ISSUE-<id>-<slug>.md` (human-readable) and `_testatlas/to_fix/ISSUE-<id>-<slug>.json` (schema-validated sidecar). Required fields per `issue.schema.json` (closed under `additionalProperties:false`): `id`, `slug`, `title`, `status` (set to `new`), `severity`, `confidence`, `type`, `domain`, `foundOn` (ISO-8601 UTC), `summary`, `expectedBehavior`, `actualBehavior`, `userImpact`, `reproductionSteps` (array), `frequency` (one of `always`/`intermittent`/`unknown`), `evidence` (non-empty array of paths under `_testatlas/evidence/`), `acceptanceCriteria` (non-empty array), `lastUpdatedAt` (ISO-8601 UTC). Optional fields: `flow`, `environment`, `persona`, `foundBy`, `relatedFiles`, `relatedCode`, `suspectedRootCause`, `scope`, `suggestedFixDirection`, `retestNotes`, `history`, plus the V2 fields (`discoveredByPersona`, `brainClaimIds`, `driftSensitivity`, `automationCandidate`, `councilConsensusLevel`, `evidenceStrength`, `retestPackPath`) and lifecycle metadata (`triagedAs`, `closedAs`). Use ONLY these property names — `description`, `foundAt`, `reproSteps`, `expected`, `actual` are not in the schema and would fail AJV validation.
9. Add back-references: append the issue ID to `_testatlas/domains/<domain-slug>/issues/index.md` (per-domain index — single-file form `issues.md` does NOT exist; the canonical path is `issues/index.md` per `.testatlas/scripts/create-domain.js`).
9.5. **Update flow back-ref index** — If the issue's `flow` field is non-null:
   - Append the issue's id to `_testatlas/to_fix/by_flow/<flow-id>.md` (create the file if it doesn't exist)
   - Maintain alphabetical / chronological order matching sibling indexes (severity, status, domain)
   - This index is the canonical source for "what issues affect FLOW-X?" — flows themselves are file pairs (`flows/FLOW-<domain>-<slug>.{md,json}`) per `.testatlas/scripts/create-flow.js`, NOT directories, so `flows/<flow-id>/issues.md` does not exist.
10. Update the cross-cut indexes: `_testatlas/to_fix/by_severity/<severity>.md` and `_testatlas/to_fix/by_status/new.md`. These are the views operators read first.
11. Validate the new JSON sidecar against `issue.schema.json` before closing. If validation fails, halt — do not partially commit a malformed issue.
12. Close the lifecycle (next section).

## Outputs

- `_testatlas/to_fix/ISSUE-<id>-<slug>.md` — human-readable issue document with repro steps, expected vs. actual, evidence links.
- `_testatlas/to_fix/ISSUE-<id>-<slug>.json` — schema-validated JSON sidecar matching `issue.schema.json`.
- Updated per-domain index `_testatlas/domains/<domain-slug>/issues/index.md` (per `.testatlas/scripts/create-domain.js`).
- Updated per-flow index `_testatlas/to_fix/by_flow/<flow-id>.md` (when applicable; flows are file pairs `flows/FLOW-*.{md,json}` per `.testatlas/scripts/create-flow.js`, not directories).
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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
