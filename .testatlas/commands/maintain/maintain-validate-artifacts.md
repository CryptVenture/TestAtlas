---
command: maintain-validate-artifacts
version: 2.0.0
description: Run comprehensive artifact validation beyond `validate-workspace` — brain JSON consistency, schema compliance for every artifact, orphaned evidence detection, dangling references, and markdown/JSON sync status.
capabilities: [shell, file-write]
produces:
  - command-result
consumes:
  - command-instruction
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Read-only over user-authored files. Writes only the validation report under `_testatlas/reports/validation.md` and lifecycle updates.
---

# TestAtlas Command (V2 maintain): maintain-validate-artifacts

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/manifest.json` and `_testatlas/brain/state.json`.
4. Inspect `_testatlas/09_artifact_index.md` and `_testatlas/11_workspace_manifest.json`.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

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
     (a) every required brain file is present (23 total: 20 JSON + 3 JSONL),
     (b) every JSON file is parseable, (c) every JSONL line parses as a JSON
     object, (d) each file's parsed value validates against its registered
     V2 schema via AJV (per-file). The script does NOT perform cross-id
     reference resolution between brain files — that pass is performed by
     the orchestrator in the `Walk _testatlas/evidence/` bullet of this
     step (preferred path) or the equivalent fallback bullets in step 2;
     it covers validation dimensions 1 and 3 (Brain JSON consistency +
     Orphaned evidence / dangling references). Supported flags are
     `--cwd <dir>`, `--brain-dir <dir>`,
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

The orchestrator halts on any non-zero exit from the four scripts it
invokes. Only `validate-brain.js` returns typed codes; the other three
scripts emit prose error messages and a non-zero exit only.

- **`validate-brain.js`** emits typed `code` fields on each finding and
  exits 1 if any finding is present. The codes that exist in the script
  source are: `BRAIN_DIR_MISSING` (workspace is V1 — recommend
  `maintain-migrate` first), `BRAIN_FILE_MISSING`,
  `BRAIN_FILE_UNREADABLE`, `BRAIN_JSON_PARSE_ERROR`,
  `BRAIN_JSONL_PARSE_ERROR`, `BRAIN_JSONL_LINE_NOT_OBJECT`,
  `BRAIN_SCHEMA_VIOLATION`, `BRAIN_REQUIRED_FIELD_MISSING`. Any other
  code mentioned in older revisions of this doc is not present in the
  script.
- **`validate-workspace.js`** exits 1 on any validation issue, 2 on an
  unknown CLI flag. It does not emit a typed code for "schemas
  directory missing"; if the schemas directory is unavailable, AJV
  load failures surface as generic errors and the script exits 1.
- **`sync-markdown-json.js`** exits 1 on a failed run with the message
  `sync-markdown-json: FAIL — <reason>`, otherwise exits 0.
- The brain-update lifecycle hook (invoked from the `## Lifecycle`
  section below) exits 1 on any error with the message
  `update-brain-after-command: <code> — <message>` (the `<code>` is the
  Node error code on the underlying I/O failure, not a TestAtlas-defined
  enum), 2 on an unknown CLI flag.
- Any of the four dimensions reporting issues → halt with non-zero
  exit so CI fails closed (the orchestrator does not support a
  `--report-only` bypass mode).

## Lifecycle

Run `node .testatlas/scripts/update-brain-after-command.js --command maintain-validate-artifacts --actor "atlas-agent" --summary "Validated workspace artifacts across brain consistency, schema compliance, evidence orphan detection, and markdown/JSON sync" --status completed` (or `--status aborted` with the error code). The standard 5 lifecycle artifacts are updated by the hook.

## What's Next


Now that artifacts have been validated:

- **`/atlas:log-issue`** — if deep-validation findings surface product-level defects (e.g., dangling issue references that hide un-fixed bugs), file issues for the underlying problems via `/atlas:log-issue`.

- **`/atlas:cleanup`** — remove or quarantine artifacts flagged invalid.
- **`/atlas:core-brain-sync`** — re-index brain state after artifact validation.
- **`/atlas:report`** — produce a fresh readiness report on the cleaned workspace.
