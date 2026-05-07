---
command: generate-scenarios
version: 2.0.0
description: Generate exploratory charters and manual test scenarios from documented flows under `_testatlas/flows/`. Output marked `generated-not-yet-validated` until executed.
capabilities: [shell, file-write]
produces:
  - command-result
  - test-scenario
consumes:
  - command-instruction
  - flow
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT execute scenarios. Does NOT mutate flow source files. Only writes md+json scenario pairs under `_testatlas/tests/scenarios/`.
---

# TestAtlas Command (V2 test): generate-scenarios

Before doing anything else:

1. Read `.testatlas/bootstrap.md`.
2. Read this command file completely.
3. Inspect `_testatlas/brain/manifest.json` and `_testatlas/brain/state.json` (if present).
4. Inspect `_testatlas/flows/` for the flow doc(s) to be turned into scenarios.
5. Follow bootstrap and this command exactly.

If there is a conflict:

1. Higher-priority runtime/system/developer instructions win.
2. Safety rules win over task ambition.
3. Bootstrap persistence and workspace rules win unless this command is more specific and not less safe.
4. Verified repository truth wins over stale documentation.

## Purpose

Transform documented flows into exploratory charters and manual test scripts
so a human or agent can take them straight to execution. Each scenario is a
deterministic projection of the source flow: identical flow → identical
scenario shape (modulo the `lastUpdatedAt` timestamp).

Every generated scenario carries `status: "generated-not-yet-validated"`. It
is NOT a passing test. It is a starting point that becomes `validated` only
after `/atlas:test-flow` (or equivalent) executes it and captures evidence.

## When to Run

- Right after `/atlas:explore` documents a new flow.
- Whenever a flow's `expectedBehavior` or `entryPoints` change.
- Before `/atlas:test-flow --all` to refresh the scenario matrix.
- After V1→V2 migration if the V1 workspace had flows but no scenarios.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/manifest.json` (if a brain has been initialised)
- `_testatlas/flows/<FLOW-id>.json` for each in-scope flow
- `.testatlas/schemas/test-scenario.schema.json` — required JSON shape
- `.testatlas/templates/markdown/scenario.md` — canonical markdown shape

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-scenarios.js`. Flags:
     - `--flow <FLOW-id>` — generate scenarios for a single flow.
     - `--domain <domain-slug>` — restrict to flows in one domain.
     - `--all` — every flow under `_testatlas/flows/`.
     - `--output-dir <path>` — override output directory (default `_testatlas/tests/scenarios/`).
   - The script atomically writes one `TEST-<flow-slug>-generated.{md,json}` pair per flow.
   - Each JSON file matches `test-scenario.schema.json`.
   - Each carries `status: "generated-not-yet-validated"`.
   - On error, halt and surface the script exit code.
2. **Fallback path (no `shell`):**
   - Read each flow JSON sidecar and the matching markdown.
   - For each flow, hand-author a scenario pair using `.testatlas/templates/markdown/scenario.md` as the markdown shape and `test-scenario.schema.json` as the JSON shape.
   - Set `status: "generated-not-yet-validated"`, `type: "exploratory"`, copy `flow`, `domain`, `priority` from the source.
   - Write via file-write to `_testatlas/tests/scenarios/`.
3. Append a brain event with `command: generate-scenarios` and the count of scenarios produced.
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/flows/`, write on `_testatlas/tests/scenarios/`)
- shell (preferred path)
- file-write (atomic write of scenario md+json pairs)

## Capability Degradation

`shell` unavailable → use the fallback path; mark every scenario `confidence: needs_validation` in any human-readable summary because the projection was hand-built rather than deterministic.

## Generated Marker

Every scenario this command produces carries `status: "generated-not-yet-validated"`. Downstream commands MUST treat that status as "not a passing test, not a coverage signal". `/atlas:test-flow` is responsible for promoting scenarios to `validated` once evidence exists.

## Outputs

- `_testatlas/tests/scenarios/TEST-<flow-slug>-generated.md`
- `_testatlas/tests/scenarios/TEST-<flow-slug>-generated.json` (validates against `test-scenario.schema.json`)
- Brain event + lifecycle close.

## Stop Conditions

- `_testatlas/flows/` missing → halt with `FLOWS_MISSING`; the operator must run `/atlas:explore` first.
- A flow JSON sidecar fails parse → halt; do NOT publish a partial scenario set.
- Schema validation failure on the written file → halt with the AJV error path.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command generate-scenarios --status success` (or `--status failure` with the error code).

## What's Next

Now that scenarios are generated:

- **`/atlas:test-flow`** — execute one of the newly generated scenarios as a flow.
- **`/atlas:test-domain`** — broaden execution to the whole domain the scenarios cover.
- **`/atlas:plan`** — feed the scenarios back into the master test plan.
