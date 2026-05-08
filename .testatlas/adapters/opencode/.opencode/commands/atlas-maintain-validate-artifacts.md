---
description: Run comprehensive artifact validation beyond `validate-workspace` — brain JSON consistency, schema compliance for every artifact, orphaned evidence detection, dangling references, and markdown/JSON sync status.
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/maintain/maintain-validate-artifacts.md" hash="da5d7cab4bb11e53407df8cc955ec3466a0b3aebe1860e2d6b4287d662e80a6e" -->
First read `.testatlas/bootstrap.md`. Then read `.opencode/commands/atlas-maintain-validate-artifacts.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

`validate-workspace` proves the workspace tree is internally consistent.
`maintain-validate-artifacts` goes further: it checks the *content* of every
artifact for presence + parseability + per-file AJV schema compliance, plus
the markdown/JSON sync expected of round-trippable artifacts. It is the command
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
4. **Markdown/JSON sync status** — `.testatlas/scripts/sync-markdown-json.js`
   (`ARTIFACT_DIRS` at lines 33-34) currently scans the `domains/`
   directory only; for paired md+json artifacts under `domains/`, the
   markdown frontmatter and the JSON sidecar MUST agree on `id`, `title`,
   `status`, `severity` (where applicable), and `lastUpdatedAt`. Drift is
   reported so an operator can run `sync-markdown-json` to reconcile.
   (Sync coverage for `flows/`, `to_fix/`, and `tests/` paired artifacts
   is a future enhancement — see CHANGELOG `Future work`. Today those
   pairs are reconciled by their respective writer scripts: flows via
   `.testatlas/scripts/create-flow.js`, issues via
   `.testatlas/scripts/create-issue.js`, etc.)

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
   - Run `node .testatlas/scripts/validate-workspace.js` — produces the
     base-layer pass/fail.
   - Run `node .testatlas/scripts/validate-brain.js` — checks brain JSON:
     (a) every required brain file is present (22 total: 19 JSON + 3 JSONL),
     (b) every JSON file is parseable, (c) every JSONL line parses as a JSON
     object, (d) each file's parsed value validates against its registered
     V2 schema via AJV (per-file). The script does NOT perform cross-id
     reference resolution between brain files — that pass lives in step 4
     below. Supported flags are `--cwd <dir>`, `--brain-dir <dir>`,
     `--suite-cwd <dir>` only; `--strict` and `--report-only` are not
     recognized by the script.
   - Run `node .testatlas/scripts/sync-markdown-json.js --dry-run` — reports drift
     between markdown frontmatter and JSON sidecars without writing.
   - Walk `_testatlas/evidence/` and cross-reference every file against
     the brain indexes; collect orphans + danglers.
   - Aggregate all four dimensions into `_testatlas/reports/validation.md`
     with TESTATLAS:GENERATED markers. Halt with non-zero exit if any
     dimension reports issues. (No `--report-only` mode exists; the
     orchestrator always halts on issues.)
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
- Any dimension reports issues → halt with non-zero exit so CI fails closed (the orchestrator does not support a `--report-only` bypass mode).

## Lifecycle

Run `node .testatlas/scripts/update-brain-after-command.js --command maintain-validate-artifacts --actor "atlas-agent" --summary "Validated workspace artifacts across brain consistency, schema compliance, evidence orphan detection, and markdown/JSON sync" --status completed` (or `--status aborted` with the error code). The standard 5 lifecycle artifacts are updated by the hook.

## What's Next

Now that artifacts have been validated:

- **`/atlas:cleanup`** — remove or quarantine artifacts flagged invalid.
- **`/atlas:core-brain-sync`** — re-index brain state after artifact validation.
- **`/atlas:report`** — produce a fresh readiness report on the cleaned workspace.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
