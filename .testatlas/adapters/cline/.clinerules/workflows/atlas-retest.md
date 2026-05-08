<!-- TestAtlas command: atlas-retest. Invoke as /atlas-retest.md. Description: Re-execute the original repro for issues with status=fixed_pending_retest; transition to closed (recovered) or reopened (still failing); append append-only retest history; capture new evidence. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/retest.md" hash="ab38cd36fd3402c89ac6c30d4446177ca46be7b8c304e6a108c6235e3158192d" -->
First read `.testatlas/bootstrap.md`. Then read `.clinerules/workflows/atlas-retest.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Close the loop on issues marked `fixed_pending_retest` (PRD §17, ISSUE-04). For each target issue, re-execute the original repro steps verbatim, capture fresh evidence, compare actual vs. expected behavior, and transition the issue: `fixed_pending_retest → retested → closed` when behavior matches expected, or `fixed_pending_retest → reopened` when the failure persists. Every retest appends a single, append-only history entry; prior entries are never rewritten. Reopened issues are tagged `type: regression` and inherit at least their original severity, ensuring regressions cannot quietly downgrade.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/severity.md` and `.testatlas/reference/confidence.md` — severity + confidence vocabulary the agent must conform to.
- `.testatlas/schemas/vocabulary.schema.json` — `issueStatus` enum (`fixed_pending_retest`, `retested`, `closed`, `reopened`) and `issueType` enum.
- `.testatlas/schemas/issue.schema.json` — required JSON shape every retested issue must continue to satisfy.
- The target issue file pair: `_testatlas/to_fix/ISSUE-<id>-<slug>.{md,json}`.
- `.testatlas/default.config.json` — adapter capability profile (whether `shell` is available).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every retest result MUST cite the new evidence files captured this run. A retest with no captured evidence is a hallucination — refuse to record either `closed` or `reopened`.
2. Verify the `shell` capability is available. If `shell` is unavailable, MUST NOT execute the original repro — refuse retest with `shell capability required for repro`. Mark findings `confidence: needs-validation` per `bootstrap.md` §4 and emit a retest-skipped record under `_testatlas/evidence/retest/<issue-id>/<ts>/skipped.md`. Never simulate retest results from training-data priors.
3. Read target issue ID(s) from operator input. Single ID or batch are both supported; for a batch, process each independently — a failure on one issue MUST NOT abort the others, but each failure is recorded in the run log.
4. For each target ID, load `_testatlas/to_fix/ISSUE-<id>-<slug>.json` and verify current `status == "fixed_pending_retest"`. If the status is anything else, refuse with `Cannot retest issue ISSUE-NNNN: status is <current>` and continue to the next target. Retest is not a generic re-execution command.
5. Re-execute the original repro steps from the issue's `reproductionSteps` array verbatim. Stage a fresh evidence directory at `_testatlas/evidence/retest/<issue-id>/<ts>/` and capture: command output (stdout + stderr + exit code), screenshots / video (when the repro is UI-driven), network log, console log, and any artifact specifically called out by the repro steps. Apply the same redaction rules `evidence.schema.json` enforces.
6. Compare the new behavior against the issue's `expectedBehavior` and `actualBehavior` fields:
   - new behavior matches `expectedBehavior` → status transition: `fixed_pending_retest → retested → closed`
   - new behavior matches `actualBehavior` (still failing) → status transition: `fixed_pending_retest → reopened`
   - new behavior is ambiguous → keep status `fixed_pending_retest` and append a history entry asking the operator for a tiebreaker; do not guess.
7. Append a retest entry to the issue's `history` array (**append-only — never delete prior entries, never edit prior entries**). The entry MUST include: `ts` (ISO-8601 UTC), `retester` (agent identifier), `status_before`, `status_after`, `evidence_paths` (the files captured in step 5), and a one-line `note`. The pre-existing `history` array is appended to in place, never rewritten.
8. Update flow confidence on the issue's referenced flow: a passing retest pushes `flowStatus` toward `retested`; a failing retest pushes it toward `blocked` and feeds back into the flow's confidence count. Update `_testatlas/to_fix/by_flow/<flow-id>.md` accordingly (the canonical existing per-flow issue index, maintained by `log-issue.md` Required Actions step 9.5). Note: flows are file pairs (`flows/FLOW-<domain>-<slug>.{md,json}`) per `scripts/create-flow.js`, NOT directories — issue back-references for a flow live in the existing `_testatlas/to_fix/by_flow/<flow-id>.md` index, never in a directory under `flows/`.
9. **Regression-tag rule.** If the retest fails (the issue moves to `reopened`), set `type: regression` on the issue (overwriting the prior type only if the prior type was not already `regression`) AND verify `severity ≥ original` — a regression may only escalate severity, never downgrade. Record the type change as a history entry with the prior type cited.
10. Update per-status indexes: remove the issue from `_testatlas/to_fix/by_status/fixed_pending_retest.md` and add it to `by_status/closed.md` or `by_status/reopened.md` as applicable. Refresh the `by_severity/` index if severity changed.
11. Validate every modified issue JSON against `.testatlas/schemas/issue.schema.json` before commit; halt on any AJV failure with the error verbatim.
12. Close the lifecycle (next section).

## Outputs

- Updated `_testatlas/to_fix/ISSUE-<id>-<slug>.{md,json}` files: status transitioned, history entry appended, type promoted to `regression` if reopened.
- New evidence directory `_testatlas/evidence/retest/<issue-id>/<ts>/` containing the freshly captured artifacts.
- Refreshed per-status indexes under `_testatlas/to_fix/by_status/` (`fixed_pending_retest`, `closed`, `reopened`).
- Updated per-flow index `_testatlas/to_fix/by_flow/<flow-id>.md` reflecting the new flow confidence (the canonical index path; flows themselves are file pairs `flows/FLOW-*.{md,json}`, not directories).
- A run-log line summarizing pass / fail counts for the batch.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record the retest run, target IDs processed, pass / fail counts, and any regression tags applied.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new evidence directories and refreshed index pages must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing every issue ID retested and the evidence directory paths.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; refresh `counts.issues` per status; reflect new evidence under `counts.evidenceRecords`.
- `_testatlas/history/run_log.md` — narrative entry: "Retested `<n>` issues; `<c>` closed, `<r>` reopened (`<g>` regressions tagged)."

## Stop Conditions

- Issue ID not found on disk → halt for that ID; surface `ISSUE-NNNN not found.` Continue with the rest of the batch.
- Status ≠ `fixed_pending_retest` → refuse for that issue; do not transition.
- `shell` capability unavailable AND repro requires shell → refuse for that issue; emit retest-skipped record; never simulate.
- Captured evidence array would be empty → refuse to record either `closed` or `reopened`; surface `no-evidence-no-finding` per `bootstrap.md` §8.
- Would mutate prior history entries → refuse; history is append-only.
- Would downgrade severity on a reopened issue → refuse; regressions may only escalate.
- Schema validation against `issue.schema.json` fails → halt for that issue; do not commit a malformed sidecar.

## Completion Criteria

- Every retested issue has fresh evidence on disk, a transitioned `status`, and exactly one new `history` entry appended this run.
- Every reopened issue has `type: regression` set and `severity ≥ original`.
- Per-status and per-flow indexes reflect the new state.
- Every mutated JSON sidecar validates against `issue.schema.json`.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered for the issues that completed retest.

## What's Next

Now that the retest pass has run:

- **`/atlas:triage`** — re-classify any reopened regressions back into the queue
- **`/atlas:report`** — fold retest outcomes into the next aggregate report
- **`/atlas:log-issue`** — file new issues if retest surfaced fresh symptoms
- **`/atlas:council-retest`** — formalize retest verdicts when outcomes are contested or coverage is unclear.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
