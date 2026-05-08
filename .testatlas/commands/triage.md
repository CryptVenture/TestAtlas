---
command: triage
version: 1.0.0
description: Deduplicate, normalize, group, and flag-as-blocker the issues under _testatlas/to_fix/; identify missing evidence; emit triage-report-<timestamp>.md.
capabilities: [shell, file-write]
produces:
  - issue
  - evidence
  - command-result
consumes:
  - issue
  - workspace-manifest
lifecycle:
  - 03_execution_status.md
  - 09_artifact_index.md
  - 10_command_log.md
  - 11_workspace_manifest.json
  - history/run_log.md
boundary: Does NOT delete issues. Does NOT mutate evidence files. Does NOT fabricate severity, confidence, or duplicate-grouping claims — every claim cites evidence. Does NOT inflate severity above what evidence supports. Does NOT close issues — closure is the responsibility of `consolidate` and `retest`.
---

# TestAtlas Command: triage

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

Apply triage discipline (PRD §17, ISSUE-03) across every issue currently parked under `_testatlas/to_fix/`: deduplicate similar reports, normalize severity against PRD §28 criteria, normalize confidence against on-disk evidence, cluster related issues into groups, flag blockers, and identify issues whose evidence array no longer resolves on disk. The outputs are an authoritative `_testatlas/to_fix/triage-report-<ts>.md`, a refreshed `_testatlas/to_fix/blockers.md`, a `_testatlas/to_fix/groups.md` cluster index, and updated per-domain / per-severity / per-status indexes. Issues are mutated in place (status, severity, confidence, history append) but never deleted — closure is reserved for `consolidate` and `retest`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `.testatlas/reference/severity.md` and `.testatlas/reference/confidence.md` — the severity + confidence vocabulary the agent must conform to during normalization.
- `.testatlas/schemas/vocabulary.schema.json` — `severity`, `confidence`, `issueStatus`, and `issueType` `$defs`.
- `.testatlas/schemas/issue.schema.json` — required JSON shape every mutated issue must continue to satisfy.
- Every `_testatlas/to_fix/ISSUE-*.json` sidecar currently on disk.
- The current `_testatlas/to_fix/by_severity/`, `_testatlas/to_fix/by_status/`, `_testatlas/to_fix/by_domain/` indexes.
- `_testatlas/agents/councils/sessions/*/consolidation.json` — most recent council session consolidations (filter to bug-triage mode); read to honor severity verdicts ratified by council.

## Required Actions

1. **Preferred path (if `shell` is available):** run `node .testatlas/scripts/triage.js [--workspace <p>] [--cwd <p>] [--dry-run] [--severity-override ISSUE-024=low] [--severity-override ISSUE-XXX=...]`. The script is idempotent (re-running on an already-triaged corpus is a no-op), AJV-validates every mutated issue JSON against `issue.schema.json` BEFORE atomicWrite, transitions `status:new` → `status:triaged` (holding `closed`/`wont_fix`), applies the three duplicate heuristics (exact title / domain+flow+repro-Levenshtein≥0.8 / shared evidence) and surfaces them in `triage-report-<ts>.md`, downgrades `confidence` to `needs-validation` for any issue whose `evidence[]` references no longer resolve under `_testatlas/evidence/`, and writes `triage-report-<ts>.md`, `blockers.md` (snapshot), and `groups.md` (cluster index by domain × type × severity). Severity is HELD by default — the script does not make autonomous severity calls. Pass `--severity-override <ISSUE-id>=<new-severity>` (repeatable) to apply explicit severity changes per PRD §28 judgment; the new severity must be one of `critical`, `high`, `medium`, `low`, `enhancement`. On success, the per-domain / per-severity / per-status / per-type indexes under `_testatlas/to_fix/by_*/` are also re-derived from disk truth — skip steps 9, 10, 11 below. **Manual path (no `shell`):** items 2–13 below describe each step the runtime performs; agents without shell capability hand-roll them and mark `confidence: needs-validation` per `bootstrap.md` §4.
2. **No evidence, no finding.** Per `bootstrap.md` §8, every triage decision (severity change, confidence downgrade, duplicate grouping, blocker flag) MUST cite the evidence file paths it relied on. Triage that cannot cite evidence MUST surface as `confidence: needs-validation` rather than as a confident claim.
3. Read every issue file in `_testatlas/to_fix/ISSUE-*.json`. Build an in-memory index keyed by `id`. If any file fails to parse, halt with the AJV error verbatim — do not proceed on a partially loaded set.
4. **Identify duplicate-candidate groups** via three independent heuristics, applied conservatively:
   - exact `title` match (case-insensitive, whitespace-collapsed)
   - same `domain` AND same `flow` AND repro-step similarity above a Levenshtein ratio of 0.8
   - any pair that references the same evidence file path under `_testatlas/evidence/`
   Two issues land in the same group if any heuristic links them. Record the heuristic that grouped them; the agent MUST be able to cite which rule fired.
5. For each group, pick the lowest-numbered ID as the canonical. Mark every other member with status `triaged` and append `triagedAs: duplicate_of=ISSUE-NNNN` plus a history entry. The canonical itself is also marked `triaged` (history entry: "canonical for group `<group-id>`"). History entries are append-only; never rewrite prior entries.
6. **Normalize severity** against PRD §28 criteria — user impact, reach, reversibility — not technical effort. Re-evaluate every issue and write the chosen value as exactly one of: `critical`, `high`, `medium`, `low`, `enhancement`. Append a history entry with the old value, the new value, and the citation supporting the change. Never inflate severity to attract attention.
7. **Normalize confidence** against `vocabulary.schema.json` enum values: `confirmed`, `strong-suspect`, `needs-validation`. For each issue, walk every path in its `evidence` array and stat it on disk. Any issue with one or more missing evidence files is downgraded to `confidence: needs-validation` AND tagged for retest in the triage report. An issue whose evidence is all present and reproduces the failure first-hand is `confirmed`; partial / indirect evidence is `strong-suspect`.
8. **Flag blockers.** Any issue satisfying (`severity == "critical"` AND `confidence ∈ {"confirmed", "strong-suspect"}`) MUST be appended to `_testatlas/to_fix/blockers.md` with its ID, title, domain, flow, evidence count, and the rationale that earned the blocker flag. Issues that no longer meet the rule (e.g. severity was downgraded this run) MUST be removed from `blockers.md` with a removal entry — `blockers.md` is regenerated as a snapshot.
9. **Identify groups.** Beyond duplicate groups, cluster issues by `(domain, type, severity)` and write `_testatlas/to_fix/groups.md` listing every cluster with member counts, lowest-numbered exemplar, and a one-line description. This is the index `consolidate` consumes.
10. **Re-derive indexes from disk** — never trust cached counts. Rebuild `_testatlas/to_fix/by_domain/<domain>.md`, `_testatlas/to_fix/by_severity/<severity>.md`, `_testatlas/to_fix/by_status/<status>.md` by walking every JSON sidecar.
11. Write `_testatlas/to_fix/triage-report-<ts>.md` summarizing: total issues triaged, duplicate groups detected (per heuristic), severity changes (up + down with citations), confidence changes, blocker count delta, missing-evidence count, and the list of issues now flagged for retest. The report MUST be reproducible from the issue files alone.
12. Validate every modified issue JSON against `.testatlas/schemas/issue.schema.json` before commit; halt on any AJV failure with the error verbatim.
13. Close the lifecycle (next section).

## Outputs

- `_testatlas/to_fix/triage-report-<ts>.md` — the new authoritative triage record.
- `_testatlas/to_fix/blockers.md` — refreshed snapshot of blocker-flagged issues (regenerated each run).
- `_testatlas/to_fix/groups.md` — cluster index by `(domain, type, severity)` for `consolidate` to consume.
- Updated `_testatlas/to_fix/ISSUE-*.json` and matching `.md` files: severity normalized, confidence normalized, status set to `triaged` where applicable, history entries appended (append-only).
- Refreshed per-domain / per-severity / per-status indexes under `_testatlas/to_fix/by_*/`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record triage run, total issues processed, duplicate groups, blockers count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list (the new triage-report + refreshed indexes must appear).
- `_testatlas/10_command_log.md` — append a row matching `command-result.schema.json` citing the triage-report path.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; refresh `counts.issues` per status; never drop the manifest's prior values silently.
- `_testatlas/history/run_log.md` — narrative entry: "Triaged `<n>` issues; `<g>` duplicate groups; `<b>` blockers; `<m>` missing-evidence."

## Stop Conditions

- `_testatlas/to_fix/` empty → halt with `Nothing to triage.` Do not invent issues.
- Any issue JSON fails to parse → halt; surface the parse error verbatim. Triage operates on a fully loaded set or not at all.
- Any modified issue would fail `issue.schema.json` validation → halt; do not commit a malformed sidecar.
- Severity claim cannot cite supporting evidence → downgrade to `low` with `confidence: needs-validation` rather than refuse the run, and record the missing-evidence flag.
- Would delete an issue file → refuse. Triage performs status / severity / confidence / history transitions only; deletion is out of scope.
- Would mutate prior history entries → refuse. History is append-only.

## Completion Criteria

- Every issue in `_testatlas/to_fix/` has been re-evaluated; `severity` and `confidence` reflect on-disk evidence.
- Every duplicate-candidate group has a canonical and the non-canonicals carry `triagedAs: duplicate_of=ISSUE-NNNN`.
- `triage-report-<ts>.md`, `blockers.md`, `groups.md`, and the per-domain / per-severity / per-status indexes are written and on disk.
- Every mutated JSON sidecar validates against `issue.schema.json`.
- The five lifecycle files listed above are updated.
- Zero stop conditions triggered.

## What's Next

Now that the triage pass has run:

- **`/atlas:retest`** — rerun fixed-pending-retest issues to confirm or regress
- **`/atlas:consolidate`** — merge duplicate groups into canonical issues
- **`/atlas:report`** — fold blockers + severity tallies into the next report
- **`/atlas:council-bug-triage`** — escalate to a multi-persona council when severity is contested or the triage queue is large.
