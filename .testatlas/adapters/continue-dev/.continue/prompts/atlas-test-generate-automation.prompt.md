---
name: atlas-test-generate-automation
description: Generate framework-specific automation skeletons (Playwright, Cypress, API, CLI, contract, smoke) from documented flows. Output marked `generated-but-not-validated` until executed.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/test/generate-automation.md" hash="7c99596c60ee6a625b9f2bcc840632f8ecef274455e0a2469560c83067fc5137" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-test-generate-automation.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Generate language-aware test automation skeletons from documented flows
(and optionally from issues with reproduction steps). Each skeleton is the
minimum viable scaffolding for a real test in the chosen framework — the
agent or engineer fills in selectors, payloads, and assertions before the
test can be promoted to `validated`.

The six supported frameworks cover the common layers of a product test
suite:

| Framework  | Output extension      | Layer            |
| ---------- | --------------------- | ---------------- |
| playwright | `.spec.ts`            | UI / browser e2e |
| cypress    | `.cy.js`              | UI / browser e2e |
| api        | `.http`               | API contract     |
| cli        | `.sh`                 | CLI / shell      |
| contract   | `.contract.json`      | Consumer/provider contract |
| smoke      | `.md`                 | Lightweight smoke checklist |

## When to Run

- After `/atlas:test-generate-scenarios` produces a new scenario set and the operator wants automation seeds.
- After `/atlas:log-issue` files an issue with a reproducible failure path that can be promoted into a regression.
- During the `automation-engineer` persona's pass after a council round.

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/flows/<FLOW-id>.json` for the flow(s) to scaffold
- `.testatlas/templates/markdown/<framework>-skeleton.md` for the canonical shape
- `.testatlas/schemas/retest_pack.schema.json` (consulted only when scaffolding from issues)

## Required Actions

1. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-automation.js --<framework>` — exactly one of `--playwright`, `--cypress`, `--api`, `--cli`, `--contract`, `--smoke`. Equivalent: `--framework <name>`.
   - Optional flags:
     - `--flow <FLOW-id>` — scaffold a single flow.
     - `--issue <ISSUE-id>` — scaffold from an issue's reproduction steps (regression seed).
     - `--all` — every flow under `_testatlas/flows/`.
   - The script atomically writes one skeleton file per flow plus a companion `<slug>.meta.json` tracking status history (`generated-but-not-validated` → `validated` → `committed` → `flaky`).
   - On error, halt and surface the script exit code.
2. **Fallback path (no `shell`):**
   - Read each flow JSON and the chosen framework template (`.testatlas/templates/markdown/<framework>-skeleton.md`).
   - Render the file shape literally, substituting flow id, name, entry point, and documented expectation.
   - Add the fixture + mock data comment block verbatim.
   - Write via file-write into `_testatlas/tests/generated_automation/<framework>/`.
   - Hand-author the companion `<slug>.meta.json` with `status: "generated-but-not-validated"` and a single-entry `status_history`.
3. Append a brain event with `command: generate-automation`, the framework, and the count of skeletons produced.
4. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/flows/` + `_testatlas/to_fix/`; write on `_testatlas/tests/generated_automation/<framework>/`)
- shell (preferred path)
- file-write (atomic write of skeleton files + meta.json companions)

## Capability Degradation

`shell` unavailable → use the fallback path. The hand-authored skeleton MUST mention fixtures and mock data explicitly so the next reviewer knows what to add. Mark every skeleton's meta `confidence: needs_validation` in addition to its status.

## Status lifecycle

Every skeleton's companion `<slug>.meta.json` carries one of:

- `generated-but-not-validated` — emitted by this command. NOT a passing test.
- `validated` — promoted after the test runs locally with real selectors and assertions filled in.
- `committed` — promoted after the validated test lands in the project's main test suite.
- `flaky` — promoted when the committed test fails intermittently in CI; signals it needs investigation, not deletion.

Downstream automation MUST inspect the companion meta to decide what is real coverage versus seed material.

## Outputs

- `_testatlas/tests/generated_automation/<framework>/<flow-slug>.<ext>` (one per selected flow)
- `_testatlas/tests/generated_automation/<framework>/<flow-slug>.meta.json` (status tracker)
- Brain event + lifecycle close.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record `<n>` automation skeletons emitted under `_testatlas/tests/generated_automation/<framework>/`.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (new skeleton + meta files appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` referencing the framework + flows.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`. Generated automation skeletons are seed material, not counted artifacts.
- `_testatlas/history/run_log.md` — narrative entry: "Generated `<n>` `<framework>` automation skeletons (status: `generated-not-yet-validated`)."

## Stop Conditions

- `_testatlas/flows/` missing → halt with `FLOWS_MISSING`.
- Unknown `--framework` value → halt with the list of supported frameworks.
- Both `--flow` and `--issue` absent without `--all` → emit zero files (no-op success).

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command generate-automation --status success` (or `--status failure` with the error code).

## What's Next

Now that automation skeletons exist:

- **`/atlas:test-flow`** — execute the generated automation against a target flow.
- **`/atlas:retest`** — re-run regression suites built from the new automation scaffolds.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
