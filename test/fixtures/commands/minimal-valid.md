---
command: minimal-valid
version: 1.0.0
description: Smallest passing command fixture used by parser and schema unit tests.
capabilities: [shell, file-write]
produces:
  - command-result
consumes:
  - workspace-manifest
  - bootstrap
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT execute destructive commands; does NOT mutate target-repo source files.
---

# TestAtlas Command: minimal-valid

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

This is a synthetic fixture used by Plan 03-01 unit tests. It carries every required frontmatter field, the verbatim PRD §38 preamble, and the lifecycle closing block. It is not a real command and is never installed into a target repo.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/11_workspace_manifest.json` (if present)

## Required Actions

1. Confirm capabilities. If `shell` is unavailable, mark findings `confidence: needs-validation` per `bootstrap.md` §4.
2. Do nothing of consequence — this fixture exists only to satisfy structural tests.
3. Update the five lifecycle files listed below.

## Outputs

- A single `command-result.schema.json`-shaped row appended to `10_command_log.md`.

## Lifecycle (close every run)

After completing this command, update these workspace artifacts:

- `_testatlas/03_execution_status.md`
- `_testatlas/09_artifact_index.md`
- `_testatlas/10_command_log.md`
- `_testatlas/11_workspace_manifest.json`
- `_testatlas/history/run_log.md`

## Stop Conditions

Stop if any required input is missing or any capability is unavailable without a documented fallback.

## Completion Criteria

All five lifecycle files updated; no stop condition triggered.
