<!-- TestAtlas command: atlas-report-domain. Paste .testatlas/bootstrap.md first; description: Render a domain-scoped report combining quality scores, issues, coverage, drift, and recommendations into _testatlas/reports/domain-<slug>.md. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/report/report-domain.md" hash="63a490b87c3172160ae49d15f7e4c1bc368a03be1f84f8247a230cfa20ecb0ee" -->
First read `.testatlas/bootstrap.md`. Then read `prompts/atlas-report-domain.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Produce a focused, human-readable report for a single domain. The report combines:

- The current `quality_scores.json` filtered to metrics that involve this domain.
- The list of flows in the domain (from `flows.json`) with their tested / drift status.
- Open and recently closed issues that affect this domain.
- Drift records that intersect the domain.
- Coverage snapshot (routes / components / endpoints touching the domain).
- Recommended next actions.

## When to Run

- Before reviewing a domain in a council session.
- Before assigning a domain owner.
- When triaging issues by domain.
- On a schedule (e.g., weekly per-domain digest).

## Required First Reads

- `.testatlas/bootstrap.md`
- `_testatlas/brain/quality_scores.json` (run `brain-score` first if missing or stale).
- `_testatlas/brain/drift.json` (run `brain-drift` first if missing or stale).

## Required Actions

1. Resolve target domain: from CLI arg `--domain <slug>` or operator-supplied parameter. Halt if the slug is not in `_testatlas/brain/domains.json`.
2. Read the canonical brain inputs.
3. **Preferred path (if `shell` available):**
   - Run `node .testatlas/scripts/generate-report.js --kind domain --domain <slug>` (existing V2 generator) which composes the report from `quality_scores.json` + domain-scoped slices of the other indexes.
4. **Fallback path (no `shell`):**
   - Render `_testatlas/reports/domain-<slug>.md` by hand using `.testatlas/templates/reports/quality_scores.md` as the section skeleton.
5. Mark every score `confidence: needs_validation` if `quality_scores.json` has not been refreshed in the current session.
6. Always include the disclaimer string from `quality_scores.json` verbatim at the top of the rendered report.
7. Close the lifecycle.

## Allowed Tools

- filesystem (read on `_testatlas/brain/`)
- shell (preferred path)
- file-write (`_testatlas/reports/domain-<slug>.md` only)

## Capability Degradation

`shell` unavailable → hand-render via the template; flag every section that requires aggregation (drift x score correlation) as `needs-validation`.

## Outputs

- `_testatlas/reports/domain-<slug>.md` (one file per invocation).
- Brain event + lifecycle close.

## Stop Conditions

- `quality_scores.json` missing → halt with instruction to run `brain-score`.
- Domain slug not found in `_testatlas/brain/domains.json` → halt with `DOMAIN_NOT_FOUND`.

## Update Brain After Command

Run `node .testatlas/scripts/update-brain-after-command.js --command report-domain --status success`.

## What's Next

Now that the domain report is generated:

- **`/atlas:test-domain`** — re-test the domain after report findings surface gaps.
- **`/atlas:council-domain-review`** — escalate to a council if the domain report flags contested risks.
- **`/atlas:report`** — roll the domain report into the workspace-wide V1 readiness assessment.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
