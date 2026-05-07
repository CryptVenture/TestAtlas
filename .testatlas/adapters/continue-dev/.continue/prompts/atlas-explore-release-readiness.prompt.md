---
name: atlas-explore-release-readiness
description: Map release artifacts, blockers, readiness state, version tags, and gates. Synthesizes signal from prior explorers into a release/no-go decision report.
invokable: true
---

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-release-readiness.md" hash="ddf628d0ac4b1104b6381a6bcc40893d4c5028cef1d72fe000c71f75776e5c81" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Synthesize release readiness from every prior explorer + the brain coverage ledger + open issues + drift state. Map release artifacts (CHANGELOG, version file, git tags, release notes drafts, deploy manifests), enumerate blockers (open critical issues, failed tests, low coverage, drift sentinel triggered), capture the current readiness state (`go` / `no-go` / `conditional`), and produce a release-readiness report under `_testatlas/reports/REPORT-release-readiness-<ts>.md`. Persist evidence under `_testatlas/evidence/explore-release-readiness/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — §4 (capability degradation), §8 (no-evidence-no-finding).
- `_testatlas/brain/state.json` — current phase, counts, last-command.
- `_testatlas/brain/issues.json` — open issues by severity.
- `_testatlas/brain/coverage.json` — coverage ledger.
- `_testatlas/brain/drift.json` — drift sentinel state.
- `_testatlas/brain/quality_scores.json` — quality scorecard.
- `CHANGELOG.md`, `package.json` (or equivalent), `_testatlas/reports/`.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `shell` to read git tags, run `git status`, parse `CHANGELOG.md`, and invoke the report generator. If unavailable, degrade to file reads of brain JSON only. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: shell`.

3. **Release-artifact enumeration.**
   - **Version file:** read `package.json.version` (Node) / `pyproject.toml.project.version` (Python) / `Cargo.toml.package.version` (Rust) / `pom.xml` (Java) / `version.txt`.
   - **CHANGELOG:** read `CHANGELOG.md`. Confirm `[Unreleased]` section exists and has entries since the last released version. Flag empty `[Unreleased]` as a blocker.
   - **Git tags:** `git tag --sort=-version:refname | head -20`. Identify the most recent release tag.
   - **Commits since last tag:** `git log <last-tag>..HEAD --oneline`. Count by conventional-commit type (feat / fix / refactor / chore / docs / test).
   - **Release-notes draft:** look under `.github/release-template.md` or `_testatlas/reports/RELEASE-notes-*.md`.
   - **Deploy manifests:** `Dockerfile`, `docker-compose.yml`, `.github/workflows/release.yml`, `infra/`, Helm charts.
   - Capture all of the above into `evidence/artifacts.json`.

4. **Blocker enumeration.**
   - **Open critical/high issues:** filter `brain/issues.json` for `severity in [critical, high]` AND `status != closed`. Count. ≥1 critical = blocker; ≥3 high = blocker (configurable via `.testatlas/default.config.json.releaseGates`).
   - **Test status:** if `evidence/explore-tests/<latest>/run.txt` exists, parse for failures. Any failure = blocker.
   - **Coverage:** if `coverage.json` shows aggregate coverage < release threshold (default 60%, configurable), flag as blocker.
   - **Drift:** if `brain/drift.json` shows `state in [stale_requires_review]` for any release-blocking artifact, flag as blocker.
   - **Brain audit:** if `evidence/explore-brain/<latest>/audit-report.md` shows validation findings, flag as blocker.
   - **Schema invariants:** if `node scripts/validate-workspace.js` exits non-zero, flag as blocker.
   - Capture all into `evidence/blockers.json`.

5. **Readiness decision.**
   - **go:** zero blockers, all gates pass.
   - **conditional:** ≥1 non-critical concern (e.g. coverage at threshold, drift in non-release-blocking artifacts).
   - **no-go:** ≥1 blocker.
   Record the decision + reasoning into `evidence/decision.json` with `{state, reasons, blockers, evaluatedAt}`.

6. **Report generation.** Invoke `node scripts/generate-report.js --type release-readiness --output _testatlas/reports/REPORT-release-readiness-<ts>.md`. The report renders sections per PRD §16.1: Run Summary, Blockers, Gates, Coverage, Drift, Open Issues, Decision, Next Steps. If `generate-report.js --type release-readiness` is not yet wired, hand-render using the `release_readiness.md` template at `.testatlas/templates/`.

7. **Cross-reference Council decisions.** Read `_testatlas/agents/sessions/council_*/consolidation.md` for any `release-blocking` consensus claims. Surface those in the report's Blockers section.

8. **Version-bump suggestion.** Based on commits since last tag, suggest semver bump (major / minor / patch) per Conventional Commits:
   - Any `BREAKING CHANGE:` footer → major.
   - Any `feat:` → minor.
   - Otherwise → patch.
   Record into `evidence/version-bump.json` (suggestion only — this command does not bump).

9. **Persist + write.** Write the report. Write `evidence/decision.json`. If any cited evidence path fails to materialize on disk, halt.

10. Close the lifecycle.

## Outputs

- `_testatlas/reports/REPORT-release-readiness-<ts>.md` — synthesized readiness report.
- `_testatlas/evidence/explore-release-readiness/<timestamp>/` — `artifacts.json`, `blockers.json`, `decision.json`, `version-bump.json`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, report path, decision (go/conditional/no-go), blocker counts.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidence`.
- `_testatlas/history/run_log.md` — narrative: "Release readiness: `<state>` — `<n>` blockers / suggested bump `<bump>` — report at `_testatlas/reports/REPORT-release-readiness-<ts>.md`."

Then run `node scripts/update-brain-after-command.js --command explore-release-readiness --actor agent --status completed --reindex`.

## Stop Conditions

- `_testatlas/brain/` not initialized → halt: "Run `/atlas:init --mode upgrade` first."
- `shell` unavailable AND brain JSON files missing → halt.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- Release-readiness report written under `_testatlas/reports/`.
- Decision (`go` / `conditional` / `no-go`) recorded with explicit blocker list.
- Version-bump suggestion recorded.
- Cross-reference to council decisions completed.
- The 5 lifecycle files updated; `update-brain-after-command.js` ran with `--reindex`.

## What's Next

- **`/atlas:report`** — produce the full quality report tying readiness to coverage and quality.
- **`/atlas:brain-export --mode archive`** — snapshot the brain alongside the release.
- (When ready) `node scripts/bump-version.js` — actually bump (manual step; this command does not auto-bump).
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
