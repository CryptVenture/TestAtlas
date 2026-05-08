<!-- TestAtlas command: atlas-explore-tests. Invoke as /atlas-explore-tests. Description: Inventory existing tests, measure coverage, identify gaps, surface flaky tests. Static audit + live test-runner probe when shell available. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore/explore-tests.md" hash="bc329dceea61ba21bacf563dcb334af854dfe07264df368b6ed77cf2a99a35af" -->
First read `.testatlas/bootstrap.md`. Then read `.agents/commands/atlas-explore-tests.md` (already loaded into your context if invoked via slash). Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Inventory the existing test suite: which test runners are configured (Jest, Vitest, node:test, Mocha, Pytest, RSpec, Go test, Cargo test, JUnit), which tests exist (unit, integration, e2e, contract), measured coverage per package + per file (line, branch, function), known flaky tests (run twice and detect non-deterministic failures), and gaps (production code without test coverage, complex modules with shallow tests). Persist evidence under `_testatlas/evidence/explore-tests/<timestamp>/`. Write a gap report into `_testatlas/maps/coverage-gaps.md` (separate from the brain coverage ledger).

## Required First Reads

- `.testatlas/bootstrap.md` — §4 (capability degradation), §8 (no-evidence-no-finding).
- `_testatlas/12_app_map.json` — apps, modules, source files in scope.
- `.testatlas/schemas/{evidence,test-run,test-scenario,app-map}.schema.json`.
- `.testatlas/default.config.json` — `allowDestructiveActions` (some tests reset DB; respect this flag).

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8.

2. **Capability check.** Requires `shell` to invoke test runners. If unavailable, degrade to file enumeration: count `*.test.{js,ts,py,rb}`, `*_test.go`, `*spec.rb` files. Mark every degraded finding `confidence: needs-validation` with `tool_unavailable: shell`.

3. **Runner detection.** Read `package.json` scripts, `pyproject.toml`, `Cargo.toml`, `Gemfile`, `go.mod`, `pom.xml`. Identify each runner with version. Capture into `evidence/runners.json`.

4. **Test inventory.**

   **Preferred path (if `shell` is available):** run `node .testatlas/scripts/explore-tests.js --out _testatlas/evidence/explore-tests/<timestamp>/inventory.json`. The script deterministically walks the repo, detects runners from manifest files (package.json, pyproject.toml, Cargo.toml, Gemfile, go.mod), inventories every test file by language pattern, categorises by directory token (unit / integration / e2e / contract / performance / smoke), infers runner per file, and emits a `{runners, inventory, summary, refreshedAt}` slice. Use `--refresh` to emit only the slice (without merging into `12_app_map.json`) — this is the form council-release-readiness round-6 invokes.

   **Manual fallback (no `shell`):** Use only file-read primitives the agent has without shell — read filesystem directories via the host's file-enumeration capability (e.g. directory-listing builtin, MCP filesystem tool, or `node:fs/promises` `readdir({withFileTypes,recursive})` if available without spawning a shell). Filter the listing to the canonical test-path globs:
   - `**/*.test.{js,jsx,ts,tsx,mjs,cjs}` for Jest/Vitest/node:test.
   - `**/*.spec.{js,jsx,ts,tsx,mjs,cjs}` for Mocha/Jasmine/Karma.
   - `tests/**/test_*.py` + `**/*_test.py` for Pytest.
   - `**/*_test.go` for Go test.
   - `spec/**/*_spec.rb` for RSpec.
   - `**/Test*.java` for JUnit.
   Bucket each test file by category (unit / integration / e2e / contract / performance). Capture the count per category into `evidence/inventory.json`. **Halt if neither `shell` NOR a file-enumeration capability is available** — the inventory pass cannot proceed without a path to truth, and fabricating a count from training-data priors is forbidden per `bootstrap.md` §8. (NOTE: `git ls-files` itself requires `shell` and is therefore NOT a valid fallback when `shell` is unavailable; it is listed only as the preferred discovery command when `shell` IS available.)

5. **Run the suite (sandbox only).** Invoke the runner with coverage flags:
   - Jest / Vitest: `--coverage --coverageReporters=json-summary,lcov`.
   - Pytest: `--cov --cov-report=json:evidence/coverage.json`.
   - Go: `-cover -coverprofile=evidence/coverage.out`.
   - Cargo: `tarpaulin --out Json`.
   Capture stdout/stderr to `evidence/run.txt`. Capture coverage report into `evidence/coverage.<format>`.
   Respect `allowDestructiveActions=false`: if the suite is gated behind a DB-reset hook, skip and record the skip rationale.

6. **Coverage parse.** Parse the coverage report into a normalized structure: per-file `{lines, branches, functions, percent}`. Compute aggregate per package + per app. Cross-reference each source file in `12_app_map.json` against coverage data — files with zero coverage become "uncovered" rows.

7. **Flaky-test detection.** Re-run the same test suite twice (intentional — two runs is the minimum signal needed to distinguish a deterministic failure from a flake). Diff the two run results: tests that pass once and fail once are flaky. Capture the flaky list to `evidence/flaky.json`. Recommend `node:test --concurrency=1` (or runner-equivalent) to verify it's not concurrency-related. **Cost guardrail:** when the suite runtime exceeds the budget set by `.testatlas/default.config.json`, restrict the second run to the subset previously marked `flaky_candidate: true` (or the failing-tests-from-run-1 subset if no such marker exists) to keep the cost bounded; record the scoping decision in `evidence/run.txt`.

8. **Gap analysis.** For each uncovered or thinly covered file (≥ 50 LOC, < 30% line coverage), produce a gap entry: `{file, percent, complexity_estimate, suggested_test_type, owning_domain}`. Write all gaps to `_testatlas/maps/coverage-gaps.md`.

9. **Persist + write.** Validate any `test-run` artifacts against `test-run.schema.json` and write rich test-run + coverage metadata to `_testatlas/maps/tests.json` (atomic). Append only the test **ID strings** (e.g. `TEST-<slug>`) to `_testatlas/12_app_map.json.tests[]` — that field is a closed string array per `app-map.schema.json` (`additionalProperties:false`). If any cited evidence path fails to materialize on disk, halt. **Note:** when invoked with `--refresh` (per step 6's preferred path), the script emits a slice ONLY and bypasses this step — there is no append to `12_app_map.json` in refresh mode. The non-`--refresh` invocation is the canonical full-write path that performs this step.

10. Close the lifecycle.

## Outputs

- `_testatlas/maps/coverage-gaps.md` — human-readable gap report sorted by complexity × low-coverage.
- `_testatlas/maps/tests.json` — rich test-run + coverage metadata (per Required Actions step 9) validated against `test-run.schema.json`; the closed-string `tests[]` array on `12_app_map.json` carries only the `TEST-<slug>` IDs that reference rows in this file.
- `_testatlas/evidence/explore-tests/<timestamp>/` — `runners.json`, `inventory.json`, `run.txt`, `coverage.<format>`, `flaky.json`, `gap-summary.json`.
- Updated `_testatlas/12_app_map.json.tests[]`.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — completion state, evidence dir, test counts, coverage %, flaky count.
- `_testatlas/09_artifact_index.md` — re-derive on-disk artifact list.
- `_testatlas/10_command_log.md` — append a `command-result.schema.json` row.
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute `counts.evidenceRecords`.
- `_testatlas/history/run_log.md` — narrative: "Inventoried `<n>` tests across `<m>` runners; coverage `<p>%`; flagged `<k>` flakes / `<g>` gaps."

Then run `node .testatlas/scripts/update-brain-after-command.js --command explore-tests --actor agent --summary "Inventoried existing tests and refreshed coverage signals" --status completed --reindex` followed by `node .testatlas/scripts/update-coverage.js --category all` so the brain coverage ledger reflects fresh measurements.

## Stop Conditions

- `shell` unavailable AND no test files in `git ls-files` → halt.
- The test suite mutates production data AND `allowDestructiveActions=false` → skip the suite, record the skip rationale, do static-only inventory + gap analysis.
- Any captured artifact path fails to materialize on disk → halt.

## Completion Criteria

- Test inventory complete: every test file bucketed by category.
- Coverage data captured per file (or skip rationale recorded if suite couldn't run).
- Flaky list produced (or skip rationale recorded).
- `coverage-gaps.md` lists every ≥50-LOC file with <30% coverage.
- The 5 lifecycle files updated; `update-brain-after-command.js` + `update-coverage.js` both ran.

## What's Next

- **`/atlas:plan`** — design new tests for the gaps reported here.
- **`/atlas:explore-brain`** — verify the brain coverage ledger reflects the run.
- **`/atlas:report`** — produce a quality-readiness report.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
