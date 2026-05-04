---
description: Deduplicate, normalize, group, and flag-as-blocker the issues under _testatlas/to_fix/; identify missing evidence; emit triage-report-<timestamp>.md.
auto_execution_mode: 1
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/triage.md" hash="3d0d3a517c28e732" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Apply triage discipline (PRD §17, ISSUE-03) across every issue currently parked under `_testatlas/to_fix/`: deduplicate similar reports, normalize severity against PRD §28 criteria, normalize confidence against on-disk evidence, cluster related issues into groups, flag blockers, and identify issues whose evidence array no longer resolves on disk. The outputs are an authoritative `_testatlas/to_fix/triage-report-<ts>.md`, a refreshed `_testatlas/to_fix/blockers.md`, a `_testatlas/to_fix/groups.md` cluster index, and updated per-domain / per-severity / per-status indexes. Issues are mutated in place (status, severity, confidence, history append) but never deleted — closure is reserved for `consolidate` and `retest`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation) and §8 (no-evidence-no-finding).
- `prd/prd.md` §17 (issue layer structure) and §28 (severity + confidence vocabulary).
- `.testatlas/vocabulary.json` — `severity`, `confidence`, `issueStatus`, and `issueType` `$defs`.
- `.testatlas/schemas/issue.schema.json` — required JSON shape every mutated issue must continue to satisfy.
- Every `_testatlas/to_fix/ISSUE-*.json` sidecar currently on disk.
- The current `_testatlas/to_fix/by_severity/`, `_testatlas/to_fix/by_status/`, `_testatlas/to_fix/by_domain/` indexes.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every triage decision (severity change, confidence downgrade, duplicate grouping, blocker flag) MUST cite the evidence file paths it relied on. Triage that cannot cite evidence MUST surface as `confidence: needs-validation` rather than as a confident claim.
2. Read every issue file in `_testatlas/to_fix/ISSUE-*.json`. Build an in-memory index keyed by `id`. If any file fails to parse, halt with the AJV error verbatim — do not proceed on a partially loaded set.
3. **Identify duplicate-candidate groups** via three independent heuristics, applied conservatively:
   - exact `title` match (case-insensitive, whitespace-collapsed)
   - same `domain` AND same `flow` AND repro-step similarity above a Levenshtein ratio of 0.8
   - any pair that references the same evidence file path under `_testatlas/evidence/`
   Two issues land in the same group if any heuristic links them. Record the heuristic that grouped them; the agent MUST be able to cite which rule fired.
4. For each group, pick the lowest-numbered ID as the canonical. Mark every other member with status `triaged` and append `triagedAs: duplicate_of=ISSUE-NNNN` plus a history entry. The canonical itself is also marked `triaged` (history entry: "canonical for group `<group-id>`"). History entries are append-only; never rewrite prior entries.
5. **Normalize severity** against PRD §28 criteria — user impact, reach, reversibility — not technical effort. Re-evaluate every issue and write the chosen value as exactly one of: `critical`, `high`, `medium`, `low`, `enhancement`. Append a history entry with the old value, the new value, and the citation supporting the change. Never inflate severity to attract attention.
6. **Normalize confidence** against `vocabulary.json` enum values: `confirmed`, `strong-suspect`, `needs-validation`. For each issue, walk every path in its `evidence` array and stat it on disk. Any issue with one or more missing evidence files is downgraded to `confidence: needs-validation` AND tagged for retest in the triage report. An issue whose evidence is all present and reproduces the failure first-hand is `confirmed`; partial / indirect evidence is `strong-suspect`.
7. **Flag blockers.** Any issue satisfying (`severity == "critical"` AND `confidence ∈ {"confirmed", "strong-suspect"}`) MUST be appended to `_testatlas/to_fix/blockers.md` with its ID, title, domain, flow, evidence count, and the rationale that earned the blocker flag. Issues that no longer meet the rule (e.g. severity was downgraded this run) MUST be removed from `blockers.md` with a removal entry — `blockers.md` is regenerated as a snapshot.
8. **Identify groups.** Beyond duplicate groups, cluster issues by `(domain, type, severity)` and write `_testatlas/to_fix/groups.md` listing every cluster with member counts, lowest-numbered exemplar, and a one-line description. This is the index `consolidate` consumes.
9. **Re-derive indexes from disk** — never trust cached counts. Rebuild `_testatlas/to_fix/by_domain/<domain>.md`, `_testatlas/to_fix/by_severity/<severity>.md`, `_testatlas/to_fix/by_status/<status>.md` by walking every JSON sidecar.
10. Write `_testatlas/to_fix/triage-report-<ts>.md` summarizing: total issues triaged, duplicate groups detected (per heuristic), severity changes (up + down with citations), confidence changes, blocker count delta, missing-evidence count, and the list of issues now flagged for retest. The report MUST be reproducible from the issue files alone.
11. Validate every modified issue JSON against `.testatlas/schemas/issue.schema.json` before commit; halt on any AJV failure with the error verbatim.
12. Close the lifecycle (next section).

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
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
