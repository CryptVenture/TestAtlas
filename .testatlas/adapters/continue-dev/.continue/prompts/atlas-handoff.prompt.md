---
name: atlas-handoff
description: Write a sub-agent handoff record at _testatlas/handoffs/HANDOFF-<timestamp>.{md,json} validating against sub-agent-handoff.schema.json with explicit context boundaries.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/handoff.md" hash="a47b5b25b78ef302d889aa59aa6af4b4ea23e9b4a7d17a393ab4c0ebbe4cf4e9" -->
First read `.testatlas/bootstrap.md`. Then read `.continue/prompts/atlas-handoff.prompt.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Write a structured sub-agent handoff record per `sub-agent-handoff.schema.json` (PRD §25) so a receiving sub-agent (or a returning future agent) can pick up exactly where this run stopped. The handoff is the durable contract between agents: it captures what is in scope, what is explicitly out of scope, what assumptions were made, what evidence is required for the next stage, and what success looks like. The output is a pair under `_testatlas/handoffs/HANDOFF-<ts>.{md,json}` — the JSON sidecar is the machine-readable contract; the markdown narrative is the human-readable companion. This command is non-finding-producing: it captures context, not claims.

## Required First Reads

- `.testatlas/bootstrap.md` — the constitution; rules-of-engagement.
- `.testatlas/schemas/sub-agent-handoff.schema.json` — required JSON shape this command must satisfy, including the `status` enum (`pending|in_progress|completed|blocked|abandoned`) and the 16 required fields.
- `_testatlas/11_workspace_manifest.json` — current workspace state; any in-flight artifacts the receiving agent inherits.
- The relevant `_testatlas/domains/<slug>/`, `_testatlas/flows/<slug>/`, `_testatlas/to_fix/`, `_testatlas/runs/`, and `_testatlas/evidence/` paths that bound the handoff scope.

## Required Actions

1. **Preferred path (if `shell` is available):** before authoring the handoff record, run two pre-flight accelerators so the receiving agent inherits a clean tree:
   - `node .testatlas/scripts/summarize-run.js [--since=<ISO>]` — distills recent RUN-*.md frontmatter into `tests/runs/SESSION-SUMMARY-<ts>.md`. Cite this summary in the handoff's `filesToRead` array so the receiver gets the situational read-out without re-reading every run.
   - `node .testatlas/scripts/normalize-slugs.js` (read-only, no `--apply`) — surfaces any mis-slugged artifacts the receiver would inherit. If the rename plan is non-empty, decide: (a) run `--apply` now (operator confirmation required) and capture the rename log into the handoff, or (b) record the dirty-slug list in the handoff's `questions` array.

   **Manual path (no `shell`):** items 2–9 below describe each step the runtime performs.
2. Verify `file-write` capability is available. The handoff record cannot be persisted without it; halt cleanly if absent and surface the missing capability per `bootstrap.md`.
3. Determine the handoff scope precisely. Identify which flows, domains, issues, runs, and evidence files are in scope for the receiving sub-agent and which are explicitly excluded. Vague scope produces context drift; the schema's `scope` and `nonScope` arrays are mandatory and must be populated with concrete repository-relative paths.
4. Allocate the handoff ID per PRD §32 — zero-padded format `HANDOFF-<ts>` where `<ts>` is the ISO-8601 UTC timestamp compressed to filesystem-safe form (e.g., `HANDOFF-20260503T141522Z`). Verify no on-disk file at that ID already exists.
5. Capture the 16 required fields verbatim per `sub-agent-handoff.schema.json`:
   - `id` — the allocated handoff ID.
   - `assignedRole` — the receiving sub-agent's role label (e.g., `ui-explorer`, `test-runner`).
   - `createdOn` — ISO-8601 UTC timestamp.
   - `createdBy` — the producing agent's identifier.
   - `status` — initial value `pending`.
   - `objective` — single sentence describing what the receiving agent must achieve.
   - `scope` — array of repository-relative paths in scope.
   - `nonScope` — array of paths explicitly out of scope.
   - `filesToRead` — paths the receiving agent MUST read before acting.
   - `filesMayUpdate` — paths the receiving agent is permitted to write.
   - `requiredEvidence` — list of evidence types the receiving agent must capture.
   - `questions` — open questions the producing agent could not resolve.
   - `constraints` — safety, capability, and policy constraints the receiving agent must honor.
   - `outputLocation` — where the receiving agent's output lands.
   - `outputStructure` — the artifact layout expected of the receiving agent.
   - `completionCriteria` — explicit, verifiable acceptance signals.
6. **Preferred path (if `shell` is available):** after writing the JSON sidecar, validate it by running `node .testatlas/scripts/validate-handoff.js _testatlas/handoffs/HANDOFF-<ts>.json [--workspace <path>] [--cwd <path>]`. The accelerator uses the suite-canonical Ajv2020 + ajv-formats singleton + the schema-loader registry, looks up `https://testatlas.dev/schemas/v1/sub-agent-handoff.schema.json`, and exits 0 on valid / non-zero on invalid with AJV errors surfaced verbatim. On non-zero exit, halt; do not commit a partial / malformed handoff. **Manual path (no `shell`):** write the JSON sidecar to `_testatlas/handoffs/HANDOFF-<ts>.json`, then validate it against `sub-agent-handoff.schema.json` using AJV before commit; halt on validation failure and surface AJV errors verbatim.
7. Write the human-readable narrative to `_testatlas/handoffs/HANDOFF-<ts>.md`. The narrative restates the JSON in prose, includes the cross-references to flows/domains/issues, and ends with a checklist matching `completionCriteria`.
8. Add a back-reference entry in `_testatlas/handoffs/index.md` (create the index file if absent).
9. Close the lifecycle (next section).

## Outputs

- `_testatlas/handoffs/HANDOFF-<ts>.md` — human-readable narrative handoff document.
- `_testatlas/handoffs/HANDOFF-<ts>.json` — schema-validated JSON sidecar matching `sub-agent-handoff.schema.json`.
- Updated `_testatlas/handoffs/index.md` — chronological index of handoffs.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record handoff issued + receiving role.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (handoff pair appears).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the handoff ID.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.handoffs` if tracked.
- `_testatlas/history/run_log.md` — narrative entry: "Issued HANDOFF-`<ts>` to `<assignedRole>` covering `<scope summary>`."

## Stop Conditions

- `sub-agent-handoff.schema.json` validation fails on the produced JSON → halt; do not commit a partial / malformed handoff.
- Receiving-agent identity (`assignedRole`) not provided → halt and prompt for the value rather than guess.
- Any required field missing or empty (e.g., empty `scope` or empty `completionCriteria`) → refuse; vague handoffs cause context drift downstream.
- Would write outside `_testatlas/handoffs/` → halt; the two-tree invariant forbids it.
- ID collision detected after recompute → halt; the timestamp clock is non-monotonic and the manifest must be inspected.

## Completion Criteria

- The handoff pair exists at `_testatlas/handoffs/HANDOFF-<ts>.{md,json}`.
- The JSON sidecar validates against `sub-agent-handoff.schema.json`.
- All 16 required fields are populated with concrete, non-placeholder values.
- The handoff index records the new entry.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the handoff is recorded:

- **`/atlas:cleanup`** — archive resolved evidence so the next operator inherits a lean tree
- **`/atlas:update`** — refresh the suite version before the next operator picks up
- **`/atlas:report-release`** — V2 release report; the next operator's primary readiness artifact.
- **`/atlas:brain-score`** — snapshot brain quality scores for handoff package.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
