<!-- TestAtlas command: atlas-maintain-validate-artifacts. Invoke as /prompts:atlas-maintain-validate-artifacts. Description: Run comprehensive artifact validation beyond `validate-workspace` — brain JSON consistency, schema compliance for every artifact, orphaned evidence detection, dangling references, and markdown/JSON sync status. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/maintain/maintain-validate-artifacts.md" hash="ebdcb6ea1de731fc249809e4424b2f3ecf7b8facd77129b23efc8d8fcd95a8da" -->
First read `.testatlas/bootstrap.md`. Then read `.codex/prompts/atlas-maintain-validate-artifacts.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

`validate-workspace` proves the workspace tree is internally consistent.
`maintain-validate-artifacts` goes further: it checks the *content* of every
artifact for cross-reference integrity, schema compliance, and the
markdown/JSON sync expected of round-trippable artifacts. It is the command
an operator runs before a release gate, after a bulk merge from another
agent, or when `validate-workspace` has been clean for weeks but suspicious
behaviour suggests a deeper drift.

The four validation dimensions:

1. **Brain JSON consistency** — every brain index that references another
   brain id (e.g., `domains.flows[]` → `flows[].id`,
   `issues.evidence_refs[]` → `evidence[].id`) MUST resolve. Missing
   references are reported as orphan-targets.
2. **Schema compliance for all artifacts** — every JSON sidecar under
   `_testatlas/` MUST validate against the schema declared in its
   `$schema` field (or in the artifact's owning index). AJV errors are
   reported with file path + JSON pointer.
3. **Orphaned evidence and dangling references** — every file under
   `_testatlas/evidence/` MUST be referenced by at least one issue, flow,
   scenario, or run record (otherwise it is orphaned). Conversely, every
   `evidence_refs[]` array entry MUST point to an existing evidence
   sidecar (otherwise it is dangling).
4. **Markdown/JSON sync status** — for paired md+json artifacts (issues,
   flows, scenarios, retest packs), the markdown frontmatter and the JSON
   sidecar MUST agree on `id`, `title`, `status`, `severity` (where
   applicable), and `lastUpdatedAt`. Drift between md and json is reported
   so an operator can run `sync-markdown-json` to reconcile.

## When to Run

- Before a release gate, after `report-release` flagged any `conditional` or `no-go`.
- After a bulk merge of work from another agent (council consolidation, PR rebase).
- On a schedule (CI nightly) to catch slow drift in the brain.
- When `validate-workspace` is clean but reports look stale.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json`, `_testatlas/brain/state.json`
- All schemas under `.testatlas/schemas/*.schema.json`
- `_testatlas/09_artifact_index.md` (the artifact catalogue)

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/validate-workspace.js --strict` — produces the
     base-layer pass/fail.
   - Run `node .testatlas/scripts/validate-brain.js --strict` — checks brain JSON
     consistency (cross-reference resolution).
   - Run `node .testatlas/scripts/sync-markdown-json.js --check` — reports drift
     between markdown frontmatter and JSON sidecars without writing.
   - Walk `_testatlas/evidence/` and cross-reference every file against
     the brain indexes; collect orphans + danglers.
   - Aggregate all four dimensions into `_testatlas/reports/validation.md`
     with TESTATLAS:GENERATED markers. Halt with non-zero exit if any
     dimension reports issues, unless `--report-only` was passed.
2. **Fallback path (no `shell`):**
   - For each schema, load the JSON, compare against artifacts by hand
     using the schema's `required` + `additionalProperties` clauses.
   - For brain consistency, follow each `<index>.<refField>` path and
     confirm the target id exists.
   - For evidence orphans, collect every evidence id referenced anywhere
     and diff against `readdir(_testatlas/evidence)`.
   - Hand-write the validation report.
3. Append a brain event with `command: maintain-validate-artifacts` and
   the per-dimension counts (issues / orphans / danglers / sync drift).
4. Close the lifecycle.

## Allowed Tools

- filesystem (read across `_testatlas/`)
- shell (preferred path)
- file-write (atomic write of `_testatlas/reports/validation.md`)

## Capability Degradation

`shell` unavailable → fall back to hand-validation per the four dimensions. The hand-validation MUST cover every schema and every evidence file; partial validation is worse than none because it gives false confidence.

## Outputs

- `_testatlas/reports/validation.md` — TESTATLAS:GENERATED report covering all four dimensions, with per-issue file path + JSON pointer + recommended remediation.
- Brain event + lifecycle close.

## Stop Conditions

- Schemas directory missing → halt with `SCHEMAS_MISSING`.
- Brain directory missing → halt with `BRAIN_MISSING`; the workspace is V1 — recommend `maintain-migrate` first.
- Any dimension reports issues AND `--report-only` was NOT passed → halt with non-zero exit so CI fails closed.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command maintain-validate-artifacts --status success` (or `--status failure` with the error code).

## What's Next

Now that artifacts have been validated:

- **`/atlas:cleanup`** — remove or quarantine artifacts flagged invalid.
- **`/atlas:brain-sync`** — re-index brain state after artifact validation.
- **`/atlas:report`** — produce a fresh readiness report on the cleaned workspace.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
