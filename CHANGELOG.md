# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

### Added

- **`.testatlas/package.json` ESM marker** — adds a 4-line `package.json` (`{"type":"module","private":true}`) at the suite root so Node parses the entire `.testatlas/scripts/` subtree as ES modules without walking up to the consumer's own `package.json`. Pre-fix, every script invocation in installed targets without `"type":"module"` in their root `package.json` (or with no `package.json` at all) emitted `(node:NNN) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///...validate-brain.js is not specified and it doesn't parse as CommonJS.` because Node defaulted to CommonJS, failed on `import`/`export` syntax, then fell back to ESM. Scripts ran correctly but every invocation was prefixed with the noisy warning, obscuring real warnings/errors. The new marker is self-contained — doesn't shadow the consumer's own `package.json` (lives only inside `.testatlas/`), doesn't ship as a standalone npm package (`"private":true`), and the suite source's existing root `package.json` (`"type":"module"`) means the marker is harmless when scripts run from the source tree. Ships via the npm tarball at `package/.testatlas/package.json` → `extractTarball` lands it at `<dstDir>/package.json` → atomic swap puts it at `<target>/.testatlas/package.json` for both init and update paths automatically. The fixture in `test/scripts/extract-tarball-strips-package-wrapper.test.js` was updated to include `package/.testatlas/package.json`; the existing assertion that "tarball-root `package.json` must NOT extract" was flipped to assert the ESM marker DOES extract with `type:"module"` content (the strip filter `package/.testatlas` still correctly excludes the outer `package/package.json`). Top-level shape assertion updated to `['adapters','bootstrap.md','migrations','package.json','scripts']`.
- **`.testatlas/adapters/claude-code/.claude/commands/atlas-create-persona.md`** — adds the long-missing adapter output for the `create-persona` source command. The file was generated locally during phase-17-05 but `git add` silently dropped it because `.gitignore`'s bare `.claude/` pattern matched the nested adapter path (see Fixed entry below). The file content is byte-identical to what `assemble-adapter --check` was expecting and matches the 12 sibling adapters that already ship `atlas-create-persona.<ext>` for the same source.

### Changed

- **CI workflow `install.sh smoke` tarball glob** — `.github/workflows/ci.yml:255,264` switched from `testatlas-*.tgz` to `*testatlas-*.tgz` to match both the legacy unscoped name and the current `webventures-testatlas-<version>.tgz` produced by `pnpm pack` since the package was renamed to `@webventures/testatlas` in commit `490d44ef` (2026-05-04). Pre-fix, the glob expanded to no files → `$TARBALL=""` → `_TESTATLAS_TARBALL_OVERRIDE=$PWD/` → `install.sh` tried to `cp` the working directory → `cp: -r not specified` → exit 1. Both the install and uninstall round-trip steps now also assert `test -n "$TARBALL"` as a defensive backstop so a future rename fails loudly instead of silently breaking the same way.
- **Biome lint debt cleared.** `pnpm lint` previously emitted 33 errors / 19 warnings / 3 infos (auto-detected by Biome 2.x); `pnpm biome check --write` applied safe fixes across 26 files: import-sort organization (alphabetical, grouped by source) and single-line collapse of multi-line single-statement expressions. Zero semantic changes — all 1888 tests remain green / 2 intentional skip post-autofix; full sample-diff review confirmed pure formatting changes (no logic edits, no removed branches, no signature changes). Touched files: 6 under `scripts/` (mcp-server, reconcile-counts, record-execution-mode, update-brain-after-command, script-flag-metadata, lib/safety) and 20 under `test/` (mostly lint-commands invariant suites). `pnpm lint` now exits 0 with 16 remaining warnings (down from 19) and 3 infos that are non-blocking.

### Removed

### Fixed

- **`.gitignore` no longer silently swallows new adapter outputs under `.testatlas/adapters/<name>/<dotdir>/`.** The bare patterns `.claude/`, `.cursor/`, `.opencode/`, `.kilocode/`, `.aider/`, `.windsurf/`, `.continue/`, `.cline/`, `.codex/`, `.gemini/`, `.roo/`, `.kiro/` (intended to ignore *consumer-side* installed adapter directories that may appear in adapter authors' working trees) also matched the nested adapter-source paths like `.testatlas/adapters/claude-code/.claude/commands/`. When a new source command was added and the adapter regen produced a corresponding output file in any of those nested paths, `git add` silently dropped it (no error, no stderr — gitignore-match is invisible). The 72 sibling adapter files already in those paths kept being tracked under the grandfather rule (gitignore doesn't untrack previously-tracked files), so `git status` showed nothing wrong; only CI's fresh-checkout adapter-parity tests caught the gap, with `expected 73 flat derived files; got 72` and downstream cascades in `adapter-parity-final`, `adapter-parity-stub`, `adapter-flat-discovery`, REQUIREMENTS.md / CLAUDE.md drift checks, and `graph-relationship` integrity tests (~29 subtest failures total across the Test ×9 matrix). The fix adds explicit negation patterns (`!.testatlas/adapters/**/.claude/`, etc.) for all 12 historically-gitignored adapter output dirs, restoring `git add` visibility for the full `.testatlas/adapters/` subtree without affecting the original intent of ignoring consumer-side installed dirs at repo roots.
- **Tests reading suite-author-local dogfood state now skip cleanly on fresh CI checkouts.** Several test files unconditionally read files under `.planning/REQUIREMENTS.md`, `CLAUDE.md`, `_testatlas/brain/*`, `_testatlas/bootstrap/*`, `_testatlas/agents/registry.json`, and `_testatlas/tests/` — all of which are intentionally gitignored (suite-author working-tree state). Locally these tests verify real content; on CI fresh checkout they failed with `ENOENT` because the files don't exist. Added a shared `skipIfMissing(t, path)` helper (`test/_helpers/repo-local-state.js`) and applied it to the entry points in `test/dist/dist03-changelog.test.js` (4 tests, REQUIREMENTS.md), `test/governance/doc-drift.test.js` (2 tests, CLAUDE.md), `test/graph-relationship.test.js` (1 test, brain/graph.json), `test/requirements-val05-closure.test.js` (3 tests, REQUIREMENTS.md), `test/schemas/drift-record-additivity.test.js` (3 tests, brain/drift.json), `test/schemas/matrix-id-pattern.test.js` (1 test, tests/), and `test/v2-structure.test.js` (8 tests, brain + bootstrap + agents/registry). Each skip is annotated with the reason in the test-reporter output so anyone reading CI logs understands the test was skipped because the file is suite-author state, not because the test was disabled. In the source repo (suite author with files present) the tests still RUN and verify content; the skip path only fires on fresh checkouts. Eliminates 20+ CI failures across all 3 OS × 3 Node versions.
- **install.sh `_TESTATLAS_TARBALL_OVERRIDE` no longer hard-fails on the published-tarball SHA mismatch.** The test hook copies a local tarball in place of the network fetch. Pre-fix, `_verify_checksum` then ran against the hardcoded `TARBALL_SHA256` (synced at release time to the published npm tarball's SHA), and a locally-packed tarball can never match because `tar` metadata + compression bits differ. `cp: -r not specified — omitting directory` was the user-facing symptom when the CI glob also failed; with the glob fix, the next layer surfaced as `WARNING: 1 computed checksum did NOT match`. Fix: when the override env var is set, `install.sh` now internally sets `TESTATLAS_SKIP_CHECKSUM=1` before calling `_verify_checksum`, so the existing skip-with-log path fires ("TESTATLAS_SKIP_CHECKSUM=1 set; skipping checksum verification.") rather than rejecting the local file. The placeholder-mode contract (`TARBALL_SHA256="REPLACE_AT_RELEASE"`) is unchanged. Signature verification (`TESTATLAS_VERIFY_SIGNATURE`) still runs when the user explicitly pins that env var alongside the override — they're then explicitly opting into a sigstore check that fails by design against a non-published tarball, which is the right behavior (loud failure = explicit consent).
- **macOS test jobs no longer fail at the prerequisite-install step with `shellcheck: command not found`.** GitHub-hosted macOS runner images previously preinstalled `shellcheck` via Homebrew; sometime mid-2026 that preinstall was dropped. The CI workflow's prerequisite step (`Install dogfood-test prerequisites`) assumed it was present and just ran `shellcheck --version` to validate. Now the step runs `brew install shellcheck` first (no-op if already present) before invoking `--version`, restoring all 3 macOS Test matrix jobs (Node 20, 22, 24).
- **Banner detection tests accept both Unicode (`█`) and ASCII (`#`) art.** On Windows runners without `WT_SESSION`/`TERM_PROGRAM` env vars, `isUnicode()` (`scripts/lib/colors.js`) returns `false` and the banner renders ASCII; the original `BANNER_LINES` (Unicode-only) lookup in `test/cli/install-js-banner.test.js`, `test/cli/update-js-banner.test.js`, `test/cli/uninstall-js-banner.test.js`, and `test/cli/install-sh-banner.test.js` matched 0 hits and failed with `expected ≥4 banner art lines; got 0` even though the ASCII banner was rendered correctly in stdout. Tests now count hits against both `BANNER_LINES` and `BANNER_ASCII_LINES` and accept ≥4 in EITHER set, so the "did we render a banner?" assertion is platform-agnostic. The dedicated `NO_UNICODE=1 → ASCII fallback` test (already explicit about which variant it expects) is unchanged.
- **Dynamic `import(<absolute-path>)` calls now wrap with `pathToFileURL` for Windows compatibility.** On Windows, Node's ESM loader rejects bare absolute paths like `D:\\a\\TestAtlas\\TestAtlas\\scripts\\validate-brain.js` with `ERR_UNSUPPORTED_ESM_URL_SCHEME: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'd:'`. The dynamic-import call sites in 34 test files (mostly `test/scripts/*.test.js` that import scripts under test via `await import(SCRIPT_PATH)`) were rewritten as `await import(pathToFileURL(SCRIPT_PATH).href)`. Each touched file got a `pathToFileURL` import added or extended. On POSIX, `pathToFileURL` produces `file:///<abs>` which Node accepts identically to the bare path — zero behavior change on linux/macOS, fixes the Windows cascade. Eliminates ~100+ Windows-only failures.
- **`regenerate-example` is now deterministic across suite checkout directory names.** `scripts/init-workspace.js` defaulted `project.name` to `path.basename(cwd)`, so running the example regen replay from a clone like `testatlas-ci-sim/` produced `project_name: "testatlas-ci-sim"` and drift-mismatched the fixture's checked-in `_testatlas/11_workspace_manifest.json` (which records `project.name: "TestAtlas"` from when the fixture was captured). Real CI passed because GitHub checks out into `TestAtlas/TestAtlas/`, matching the fixture, but local-clone test runs failed on all 8 example regen jobs. Fix: `init-workspace.js` accepts a `--project-name <name>` CLI flag, a `TESTATLAS_PROJECT_NAME` env var override, or the previous basename default — in that order; `scripts/lib/regenerate-core.js` reads the checked-in example fixture manifest at replay time, extracts its `project.name`, and pins it via the new flag so the regen output deterministically matches the on-disk fixture regardless of where the suite repo is cloned.
- **CLI direct-invocation guards now work on macOS and Windows.** 46 scripts under `scripts/` had one of three broken guard patterns: (a) `path.resolve(process.argv[1]) === path.resolve(__thisFile)` (broken on macOS because `mkdtemp` returns `/var/folders/...` paths that symlink to `/private/var/folders/...`, and `path.resolve` doesn't follow symlinks so the two never match for tempdir-launched scripts); (b) `import.meta.url === \`file://${process.argv[1]}\`` (broken on Windows because `import.meta.url` produces `file:///D:/...` with forward slashes while `process.argv[1]` is `D:\...` with backslashes); (c) variants of both. When the guard failed, `cliMain()` was never called → the script exited 0 with no output. This produced silently-wrong test results: spawn-and-assert tests saw empty stdout and the test reporter reported assertion failures like `expected ≥4 banner art lines; got 0` or `expected non-zero exit, got 0`. Replaced all 46 callsites with `isMainModule(import.meta.url)` from a new shared helper `scripts/lib/is-main.js` that `realpath`-canonicalizes both sides before comparing. Eliminates 40+ macOS and Windows-only test failures, all caused by spawned scripts that silently no-op'd.
- **Dynamic `import()` calls with multi-line path expressions also wrap with `pathToFileURL`.** The earlier single-line fixup in this section caught `await import(IDENT)` but missed 17 test files where the argument is a multi-line `path.join(...)` expression or a template literal. Extended the wrapper to handle multi-line expressions, EXCLUDING (1) relative module specifiers like `'../scripts/...'` (which the ESM loader accepts as-is), (2) `node:` builtin specifiers (which `pathToFileURL` rejects), and (3) expressions already starting with `pathToFileURL(`. Tests like `v2-schemas`, `e2e/v2-workflow`, `extract-claims`, `consolidate-council`, `council-session`, `update-graph`, `quality-scoring`, `graph-relationship`, `schema-template-parity-v2`, `explore-codebase-integrations`, `explore-tests-inventory`, plus a dozen others now load script modules on Windows without `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

## [2.0.2] - 2026-05-10

### Added

### Changed

### Removed

### Fixed

- **Hotfix — `update` no longer wipes `<target>/.testatlas/scripts/`.** `extractTarball()` (`scripts/lib/tarball.js`) extracted only `package/.testatlas/` from the npm tarball, dropping the sibling `package/scripts/` tree on the floor. The atomic-swap step in `runUpdate()` then renamed the staged tree (with no `scripts/`) into place, deleting the script subtree the prior `init` had populated via `copyValidatorScripts()`. Net effect on every released v2.0.x consumer: the first `npx @webventures/testatlas update [--force-reinstall]` removed every accelerator script (`create-domain.js`, `sync-system-map.js`, `create-issue.js`, `create-flow.js`, `create-evidence-record.js`, `update-indexes.js`, `validate-workspace.js`, etc.) plus their `lib/` closure, forcing every `/atlas:*` command into its slow manual-fallback path and breaking the `/atlas:map-domains` preferred path the user reported. v2.0.2 makes `extractTarball` perform two staged extractions: `package/.testatlas/` (`--strip-components=2`, unchanged) and `package/scripts/` (`--strip-components=1`, excluding `scripts/e2e/` to mirror `copyValidatorScripts`'s init-time exclusion). The staged tree now mirrors a fully-installed `.testatlas/` so the post-swap `<target>/.testatlas/` includes its `scripts/` subtree. Three new regression tests in `test/scripts/extract-tarball-strips-package-wrapper.test.js` pin the new contract: `package/scripts/x.js → dstDir/scripts/x.js`, `package/scripts/lib/y.js → dstDir/scripts/lib/y.js`, and `package/scripts/e2e/z.js` excluded; the existing top-level-shape assertion was updated to `['adapters','bootstrap.md','migrations','scripts']`. End-to-end verified by packing the suite locally and asserting all six user-facing accelerator scripts arrive in the staged tree. No init-path change required — `copyValidatorScripts()` (`scripts/lib/install-core.js:472-494`) already handled this for fresh installs; v2.0.2 brings the update path to parity.

## [2.0.1] - 2026-05-10

### Fixed

- **Hotfix — `update --force-reinstall` no longer denied by default `safeMode:true`.** v2.0.0 added a `requireCapability(config, 'destructive-fs')` gate at `runUpdate()` entry (Phase 18-01 / ISSUE-011 defense-in-depth) but left no bypass for top-level CLI invocations, so `npx @webventures/testatlas update --force-reinstall` against a fresh install hit `Capability denied (destructive-fs): safeMode is enabled` even though the user explicitly invoked the canonical update command. v2.0.1 adds `opts.bypassSafetyGate` to `runUpdate()` and `runUninstall()`; `bin/testatlas.js` passes `bypassSafetyGate: true` for both subcommands (CLI = explicit user consent). Programmatic / sub-agent callers do NOT pass the flag and remain config-gated, preserving the original ISSUE-011 / ISSUE-014 defense-in-depth value. Two new regression tests in `test/update/update-safety.test.js` pin both paths: bypass honored under `safeMode:true`; absence of bypass still denies under `safeMode:true`.

### Changed

### Added

## [2.0.0] - 2026-05-10

TestAtlas v2.0.0 is a major release introducing the **Multi-Agent Quality Intelligence Brain** — a persistent, machine-readable quality layer that turns any capable AI agent into a product-understanding, exploration, and evidence-collection system. V2 adds 41 new commands, 18 new schemas, 14 system personas, 11 council commands, and full support across all 18 host adapters. Phase 22 + Phase 23 follow-on work (closing 8 COUNCIL-2026-05-09-003 brain-audit findings) plus the COUNCIL-2026-05-10-001 release-readiness fixpack are folded into the v2.0.0 release per Option A of the council's release-cut decision.

### Phase 23 — Close 8 COUNCIL-2026-05-09-003 brain-audit findings (DEC-001..DEC-008 + OPEN-001)

Phase 23 closes the structural-not-functional residue from Phase 22 surfaced by COUNCIL-2026-05-09-003. All 8 motions carried; 5 net-new high-leverage gaps the Phase-22 verifier missed. Backward-compat absolute — every fix is additive.

#### Fixed (Phase 23)

- **DEC-001 / ISSUE-042 + ISSUE-045** — Audit-honesty: 22-04-SUMMARY.md + Phase-22 Verification narrative now cite live test counts (1842 / 1836 pass / 6 distinct fail / 2 skip) with all 6 distinct failure names enumerated.
- **DEC-002 / ISSUE-038** — `_testatlas/brain/drift.json` repopulated with 11 schema-conforming records (DRIFT-001..DRIFT-011) reflecting COUNCIL-2026-05-09-002 audit findings; `drift-record-additivity.test.js` Test 4 (length===11) GREEN.
- **DEC-003 / ISSUE-039** — `scripts/update-indexes.js#listCouncilSessions` reads each session.json and emits per-session bullets with `topic + mode= + participants=N + status=`; 09_artifact_index.md council-sessions block now enumerates real metadata. Missing session.json falls back to path-only (back-compat).
- **DEC-004 / ISSUE-040** — `.testatlas/commands/explore.md` trimmed to ≤1800 words AND ≤6 What's Next entries; long-form per-child brief contract extracted to NEW `.testatlas/reference/explore-orchestration.md`.
- **DEC-005 / ISSUE-043** — `_testatlas/00_overview.md` "Core Domains" section replaced with TESTATLAS:GENERATED `domain-count` block driven by `state.json#counts.domains`; doc never drifts from brain truth.
- **DEC-006 / ISSUE-041** — `--reconcile-counts --populate-from-app-map --detect-drift` flags wired into the existing `update-brain-after-command.js` invocations in `.testatlas/commands/explore-codebase.md` and `.testatlas/commands/core/brain-sync.md`; Phase-22 producer scripts now fire at runtime; `lifecycle-flag-wiring.test.js` pins the wiring.
- **DEC-007 / ISSUE-044** — `scripts/consolidate-council.js` docstring lines 215-221 trimmed to drop the orphan `'strong-suspect'` mention; comment now matches code at line 227.
- **DEC-008** — `CHANGELOG.md [0.1.0]` gains `### Schema migration` section; `package.json#version` bumped 1.2.6 → 2.0.0. DIST-03 + package-version-vs-CHANGELOG tests GREEN.

#### Added (Phase 23)

- **OPEN-001 ADR captured** — `.testatlas/reference/council-protocol.md` gains "Deferred design — vote-status producer (OPEN-001)" section documenting the future `update-claim-status-from-votes.js` producer that would let DEC-004's OR-gate tighten to AND without re-introducing the 5-phase silent zero-promotion regression. Implementation deferred; design + scaffolding captured here.
- **NEW** `.testatlas/reference/explore-orchestration.md` — long-form per-child brief contract reference extracted from `explore.md` per CMD-03 budget compliance.

#### Verification (Phase 23)

- `pnpm test`: **1877 total / 1875 pass / 0 fail / 2 intentional skip** (the previously-failing 6 distinct ✖ all flipped GREEN; Wave-2 cascade RED bars closed by Wave-3 adapter + example regen).
- `check-adapter-parity --strict`: **1314/1314 obligations** (100.0%) — restored from Wave-2 source-body divergence (910/1314 RED → 1314/1314 GREEN).
- `lint-commands` 0 violations; `check-command-budgets` / `validate-workspace` / `validate-brain` all exit 0.
- 18 adapter trees + 7 example workspaces regenerated; 5 Wave-0 RED-bar tests authored (`update-indexes-council-sessions-rich`, `00-overview-domain-count`, `lifecycle-flag-wiring`, `consolidate-council-comment-code-parity`, `council-protocol-deferred-design`) — all GREEN post-Wave-1/2 implementation.
- Concurrent-agent boundary preserved through Phase-23 closure: `scripts/lib/install-core.js` + `scripts/lib/update-core.js` byte-identical pre-/post (commits `70e73331..838bae58`).

### Fixed (Phase 23 / Plan 23-03 — DEC-001 audit-honesty correction to Phase-22 verification)

- **Phase-22 Verification narrative corrected.** Original CHANGELOG + `22-04-SUMMARY.md` cited "1837/3/2 of 1842"; live counts at Phase-22 closure were **1842 / 1836 pass / 6 distinct ✖ / 2 skip**. Phase 23 closes all 6. Full post-mortem: see `.testatlas/reference/audit-honesty-history.md`.

### Added (Phase 23 / Plan 23-01 — Wave 0 TDD red-bar)

- 5 RED-bar regression tests pinning Phase-23 contracts (DEC-003, DEC-005, DEC-006, DEC-007, OPEN-001) BEFORE production-code edits, per Nyquist contract:
  - `test/update-indexes-council-sessions-rich.test.js` — DEC-003 pins `listCouncilSessions` enrichment.
  - `test/00-overview-domain-count.test.js` — DEC-005 pins `domain-count` GENERATED block live-sync.
  - `test/commands/lifecycle-flag-wiring.test.js` — DEC-006 pins `--reconcile-counts --populate-from-app-map --detect-drift` invocation.
  - `test/scripts/consolidate-council-comment-code-parity.test.js` — DEC-007 pins zero `strong-suspect` in docstring.
  - `test/reference/council-protocol-deferred-design.test.js` — OPEN-001 pins the deferred-design ADR.
- Test suite delta: 1842 → 1877 (+35); 1834 → 1849 pass (+15 baselines GREEN); 6 → 26 fail (+20 RED contract pins). All baseline RED tests preserved unchanged.

### Fixed (Release-readiness post-Phase-23, COUNCIL-2026-05-10-001)

- **DEC-002..DEC-005 fixpack** — Pre-tag closure of 9 residual workspace-hygiene findings surfaced by the Release Readiness council (2026-05-10): cleared `validate-workspace` schema-discipline (dropped unregistered `$schema` URL from `_testatlas/brain/drift.json`; auto-healed manifest counts; refreshed cross-cut index hashes for 7 `to_fix/by_*` indexes — `validate-workspace` 0 errors / 0 warnings); transitioned 8 brain rows ISSUE-038..045 from `status:new` → `status:closed` with append-only history entries (closing the lifecycle gap where Phase-23 closed code but did not flip status); trimmed `CHANGELOG.md` from 3080 → 3000 words by extracting the Phase-22 audit-honesty post-mortem to `.testatlas/reference/audit-honesty-history.md` (with 1-line cross-reference); folded the `[Unreleased]` Phase-22+23 entries into this `[2.0.0]` block per release-cut Option A. Surfaced 4 issue candidates (validate-workspace.js + check-token-budget.js exit-code masking — turned out NOT to be regressions; the masking was a piped-`tail` measurement artifact in the council prompt; AJV singleton drift schema registration; brain-status lifecycle gap → OPEN-007 obd-verifier checklist extension). Final state: `pnpm test` 1877/1875/0/2; `validate-workspace` 0/0; `validate-brain` OK; `check-adapter-parity --strict` 1314/1314; `check-token-budget CHANGELOG.md 3000` PASS. Full audit at `_testatlas/agents/councils/sessions/COUNCIL-2026-05-10-001/`.

### Added

- **V2 Multi-Agent Quality Intelligence Brain.** A persistent `_testatlas/brain/` tree with 16 JSON files (`manifest.json`, `state.json`, `coverage.json`, `domains.json`, `flows.json`, `issues.json`, `evidence.json`, `decisions.json`, `risks.json`, `assumptions.json`, `graph.json`, `quality_scores.json`, `drift.json`, `agent_sessions.json`, `personas.json`, `events.jsonl`) that captures everything an agent learns about the product under test. Every brain file is AJV-validated before write.
  - `scripts/validate-brain.js` — full brain validation against V2 schemas
  - `scripts/score-quality.js` — 11 deterministic quality metrics (0-100, no LLM judgment)
  - `scripts/detect-drift.js` — git-diff-based drift detection with 7 input categories
  - `scripts/update-graph.js` — 16-relationship knowledge graph populator
  - `scripts/update-brain-after-command.js` — automated post-operation brain update hook
  - `scripts/sync-markdown-json.js` — idempotent markdown/JSON reconciliation
  - `scripts/index-artifacts.js` — brain index rebuild from workspace scan
  - `scripts/generate-dashboard-data.js` — machine-readable dashboard export
  - `scripts/build-sqlite.js` — optional SQLite projector (graceful degrade when `better-sqlite3` absent)

- **V2 Command Surface — 41 new commands (73 total).** Commands are now organized into 7 categories:
  - `core/` — `init`, `status`, `bootstrap-refresh`, `brain-sync`, `brain-validate`, `brain-query`, `brain-compact`, `brain-export` (8 commands)
  - `explore/` — `explore-state`, `explore-errors`, `explore-components`, `explore-routes`, `explore-jobs`, `explore-security-privacy`, `explore-observability`, `explore-tests`, `explore-brain`, `explore-release-readiness`, `explore-all` (11 commands)
  - `test/` — `generate-scenarios`, `generate-automation`, `generate-retest-pack`, `test-critical-flows` (4 commands)
  - `council/` — `council`, `council-domain-review`, `council-flow-review`, `council-product-review`, `council-bug-triage`, `council-release-readiness`, `council-red-team`, `council-brain-audit`, `council-retest`, `council-design-critique`, `council-test-plan` (11 commands)
  - `brain/` — `brain-score`, `brain-drift` (2 commands)
  - `report/` — `report-domain`, `report-release`, `report-dashboard-data` (3 commands)
  - `maintain/` — `maintain-migrate`, `maintain-validate-artifacts` (2 commands)

- **Persona & Council System.** 14 built-in system personas (`product-strategist`, `user-advocate`, `qa-lead`, `accessibility-reviewer`, `performance-skeptic`, `security-privacy-reviewer`, `api-contract-analyst`, `codebase-mapper`, `runtime-investigator`, `data-steward`, `adversarial-red-team-tester`, `documentation-curator`, `automation-engineer`, `release-readiness-judge`) each with md+json pairs, blind spots, evidence requirements, and safety limits. 5 reusable council templates (`domain-review`, `release-readiness`, `bug-triage`, `red-team`, `brain-audit`) configure default participants and stop conditions. The 9-round council protocol (context-read → independent-review → initial findings → cross-question → disagreement capture → rebuttal → vote → consolidation → canonical-update) is documented in `.testatlas/reference/council-protocol.md`.

- **Council Session Infrastructure.** `scripts/create-council-session.js` creates a full session directory with 15 artifacts (session.{md,json}, prompt.md, context_bundle.md, participants.json, transcript.{jsonl,md}, claims.jsonl, disagreements.md, votes.json, consolidation.{md,json}, followups.md, generated_{issues,flows,questions}.md). `scripts/extract-claims.js` parses transcripts for CLAIM markers. `scripts/consolidate-council.js` produces followups and updates `brain/decisions.json`. `scripts/record-execution-mode.js` provides post-hoc execution mode tracking.

- **V2 Schemas — 18 new JSON Schemas (39 total).** New schemas: `persona`, `council_session`, `claim`, `transcript`, `event`, `story`, `coverage`, `quality_score`, `drift_record`, `relationship`, `dashboard_data`, `retest_pack`, `decision`, `risk`, `assumption`, `sub-agent-handoff`, `install-manifest`, `example-script`. All schemas use JSON Schema Draft 2020-12 and whitelist `$schema` annotations on closed schemas.

- **Explorer Map Templates.** 16 template files (8 md + 8 json) across 8 surface types: `routes`, `pages`, `components`, `states`, `endpoints`, `jobs`, `cli_commands`, `integrations`. Each template declares the full field shape per PRD §7.13 with `TESTATLAS:GENERATED` markers for sync-markdown-json reconciliation.

- **Automation Skeleton Generation.** `scripts/generate-automation.js` emits framework-aware test skeletons for 6 frameworks: Playwright (`.spec.ts`), Cypress (`.cy.js`), API (`.http`), CLI (`.sh`), Contract (`.contract.json`), Smoke (`.md`). Each skeleton carries fixtures + mock-data comment blocks and a companion `.meta.json` status tracker.

- **Capability Gate Safety Infrastructure.** Destructive filesystem operations (`cp`, `rm`, `unlink`, `rename`) are gated by `requireCapability(config, 'destructive-fs')` which respects `safeMode` and `allowDestructiveActions` config. Violations throw `CAPABILITY_DENIED`. `test/safety/capability-gate-invariant.test.js` walks every script and asserts the gate is present.

- **27 Command Invariants in `lint-commands.js`.** Automated doc-vs-truth validation catches: flag existence, path canonicity, schema key existence, lifecycle completeness, frontmatter script form, flag completeness, enum value validity, vocabulary enum drift, lifecycle position, schema file existence, maps path consistency, bare script paths, duplicate section headings, config key existence, option pair completeness, step cross-references, stop code existence, outputs vs required actions, numerical claims vs scripts, capability-stop condition contradictions, MCP tool param validity, canonical product names, missing canonical sections, shell required in fallback, undefined cross-references, and product name canonicalization.

- **Audit Manifest.** `.testatlas/audit-manifest.json` tracks every factual claim in every command body with resolution status against the invariant catalog. 986 claims at 57% resolution rate — new invariants surface claims faster than they resolve, driving the asymptote toward zero.

- **Cross-Reference Integrity Testing.** `test/commands/mesh-graph.test.js` asserts zero orphans, dead-ends, broken refs, and slash collisions across the full 73-command graph. `test/agentic/cross-reference-integrity.test.js` resolves every `/atlas:NAME` mention against the live command set.

- **Adapter-Aware Preamble Path Injection.** `{{ADAPTER_COMMAND_PATH}}` placeholder in `bootstrap.md` is substituted at render time with the actual target-repo install path per adapter (e.g. `.claude/commands/atlas-bootstrap.md` for Claude Code, `.kilocode/workflows/atlas-bootstrap.md` for KiloCode). Prevents agents from probing wrong filesystem paths.

- **Execution Mode Tracking.** Council sessions track `executionMode` (`parallel-subagents`, `single-spawn-inline`, `sequential-fallback`, `classify-only`, `inline-simulation`, `no-op`) with a 5-tier auto-detect helper. Tier 5 (both signals omitted) leaves the field absent so the orchestrator records it post-hoc.

- **New Documentation.** `docs/V2_WORKSPACE.md` — complete brain tree, agents tree, map templates, and report exports reference. `docs/PERSONAS_AND_COUNCILS.md` — 14 personas, 5 councils, 9-round protocol, and custom persona creation guide. `docs/GETTING_STARTED.md` extended with V2 Advanced Path.

### Changed

- **Adapter System — full V2 support across all 18 adapters.** Per-command-file adapters (13) render both flat V1 and categorized V2 commands in nested subdirs. Multi-source adapters (5) emit concatenated outputs covering the full 73-command surface. Capability vocabulary extended from 6 → 9 entries (`council-orchestration`, `brain-sync`, `persona-context` added). Adapter parity gate: 1314/1314 obligations satisfied, zero drift.

- **V2 commands render flat at adapter root.** Phase 16 fix ensures V2 categorized commands are rendered as flat files (e.g. `atlas-core-init.md`, `atlas-explore-state.md`) so slash-command discovery works on flat-only hosts (Claude Code, Codex). No naming collisions across 73 source files.

- **`validate-workspace --auto-heal` applies by default (v1.2.0).** Bare `--auto-heal` writes to disk; `--dry-run` for preview. `--apply` is a documented no-op for back-compat.

- **Brain writers honor `TESTATLAS_FIXED_TIMESTAMP`.** All V2 writers that emit brain JSON route `last_updated` through the determinism contract so `regenerate-example --check` is byte-identical across replays.

- **Uninstall deep prune.** `scripts/uninstall.js` recursively prunes deep V2 directory trees (`.testatlas/agents/personas/system/`, adapter nested subdirs, etc.) bottom-up after manifest-driven file removal.

- **Schema counts corrected across docs.** README.md, docs/SCHEMAS.md, docs/ADAPTERS.md now report 39 schemas (21 V1 + 18 V2), 73 commands (32 V1 + 41 V2), 18 adapters, 14 personas, 5 council templates.

### Fixed

- **200+ doc-vs-truth drift issues closed across 13 dogfood rounds (Rounds 7–13).** Categories: stop code claims, output path consistency, lifecycle hook completeness, numerical claim accuracy, schema filename casing, slash-command references, capability declarations, canonical count keys, bare script paths, duplicate headings, cross-reference resolution, MCP tool param validity, and product name canonicalization.

- **Test suite: 0 failures.** 1766 pass / 0 fail / 2 skipped (intentional E2E gates). Pre-V2 baseline was 1735/25/2. All 26 schema-mapping baseline errors closed.

- **`validate-workspace` passes clean.** 0 errors, 0 warnings across 12 checks. Previously failed with 28 `TESTATLAS_UNKNOWN_SCHEMA` errors on persona/council-template/map paths.

- **Safety gaps closed.** `v2-migrate.js` and `update-core.js` destructive operations now correctly gated by capability checks (was hardcoded safeMode + ignored return). `normalize-slugs.js` apply branch gated. `e2e/run-node-api-graph.js` documented as tmpdir-only safety exempt.

- **Schema conformance.** `app-map.schema.json` extended with 6 optional top-level properties (`errorHandling`, `integrationEnvironments`, `runtimeMetadata`, `observability`, `securityFindings`, `states`). `issue.schema.json` added `triagedAs` and `closedAs`. `vocabulary.schema.json` extended with 7 V2 enums (`claim_type`, `council_type`, `drift_status`, `persona_type`, `message_type`, `disagreement_type`, `vote_value`). `test-scenario.schema.json` widened for optional `confidence`. `config.schema.json#pinnedVersion` accepts caret/tilde/comparator semver ranges.

- **Consolidator filter broadened.** `scripts/consolidate-council.js` now accepts `observed`/`inferred`/`hypothesized` claims with `status='accepted'` or `confidence='confirmed'`/`'strong-suspect'`, fixing a 5-phase silent corruption where every council session produced 0 `brain/decisions.json` entries.

- **Votes render back-compat.** Motion-keyed votes (`votes.motions[]?.votes[]`) supported alongside legacy `votes.votes[]` shape.

- **`embeddings_manifest.json` no longer required.** `validate-brain.js` tolerates its absence for forward-compat with future vN+1 embedding producers.

- **`drift.json` schema-conforming structure.** Trimmed 7 excess fields per record to match `drift_record.schema.json#additionalProperties:false`.

- **Stale version references removed** from docs/UPDATE.md, docs/RELEASE.md, docs/SIGNING.md. Gitignored `.planning/` file references cleaned from docs/SCOPE.md and docs/THREAT_MODEL.md.

- **Orphan file removed:** `docs/static-html-report-spec.md` (duplicate of `prd/static-html-report-spec.md`).

### Security

- Capability gates on all destructive filesystem operations (`v2-migrate`, `update`, `normalize-slugs`).
- `requireCapability(config, 'destructive-fs')` hard-fails before any `cp`/`rm`/`rename` under default-deny config.

### Notes

- **No breaking changes for V1 users.** All V1 commands, schemas, and adapter outputs are byte-identical pre/post v2.0.0. V2 commands live in categorized subdirectories that V1's flat enumeration excludes by design.
- **JSON remains canonical.** SQLite is derived/cacheable only. Every artifact is schema-validated before write.
- **TestAtlas v1.x enters maintenance.** LTS window: 2.x active, 1.x maintenance, 0.x EOL.

## [1.2.6] - 2026-05-06

_No notable changes since 1.2.5._

## [1.2.5] - 2026-05-06

_No notable changes since 1.2.4._

## [1.2.4] - 2026-05-06

_No notable changes since 1.2.3._

## [1.2.3] - 2026-05-06

_No notable changes since 1.2.2._

## [1.2.2] - 2026-05-06

_No notable changes since 1.2.1._

## [1.2.1] - 2026-05-06

_No notable changes since 1.2.0._

## [1.2.0] - 2026-05-06

### Changed

- **BREAKING — `validate-workspace --auto-heal` now applies by default.** Bare `--auto-heal` writes to disk; pass `--dry-run` for preview. `--apply` is a documented no-op for back-compat. Migration: add `--dry-run` to scripts expecting preview-only behavior.
- `scripts/lib/adapters/render-mcp.js` requires explicit `version` parameter. MCP manifest now tracks the suite version correctly.

### Fixed

- **High-severity — `runUpdate` now executes full adapter upgrade lifecycle.** Previously only renamed `.testatlas/`; adapter outputs outside the suite tree (`.claude/commands/`, `.cursor/rules/`, `AGENTS.md`, `.aider/CONVENTIONS.md`, etc.) were never re-emitted on update. v1.2.0 adds `restageAdapters` helper that re-emits all adapter command files, prunes orphans, and includes them in the regenerated manifest. Action required: run `npx @webventures/testatlas update --force-reinstall` once after updating to v1.2.0.
- Reporter preview subtitle now appears under the section header for unmissable preview-only state.

## [1.1.0] - 2026-05-06

### Added

- Cosign + dogfood-test infrastructure (`sigstore/cosign-installer@v3` in CI, `scripts/setup-dogfood-env.sh` pre-flight probe).
- `CONTRIBUTING.md` Dogfood Test Prerequisites section.
- Per-area report views (`regressions.md`, `readiness.md`, `coverage.md`, `quality_risks.md`).
- `counts.reports` field in `workspace-manifest.schema.json`.
- `scripts/triage.js` production-grade idempotent triage driver.
- POSIX banner in `install.sh` with `NO_COLOR`/`NO_UNICODE`/non-TTY support.
- `renderBanner` wired into `install.js`, `update.js`, `uninstall.js`.
- Production-grade release driver (`scripts/bump-version.js`): pre-flight gates, CHANGELOG migration, atomic commit + tag, `gh release create`, optional `--wait` for OIDC publish completion.
- `docs/RELEASE.md` "Local release driver" section.

### Changed

- `generate-report.js` readiness verdict filters closed/wont_fix issues before severity check.
- `generate-report.js` run dedup, per-domain coverage detection, and Test Pyramid type-classification fixed.
- `generate-report.js` autoheal parity: HEAL-01 recomputes `counts.reports`.
- `commands/triage.md` preferred-path entry declares `node .testatlas/scripts/triage.js`.
- `install.sh` line budget raised to 290 for banner function.
- `test/release/pack-contents.test.js` ceiling raised to 8MB.
- `scripts/sync-status.js` reports counter matches `REPORT-*.md` files only.
- Bootstrap-token publish path deprecated; OIDC Trusted Publishing is canonical.

## [1.0.0] - 2026-05-04

First production GA release. Closes Phase 8 (examples + auto-doc generators + GA polish) and consolidates Phases 0–7.

### Added

- Bootstrap & Constitution (Phase 1): `.testatlas/bootstrap.md`, capability-aware degradation, full config layer.
- Schemas & Templates (Phase 2): 18 JSON Schemas + `vocabulary.json`, markdown templates, generated-section markers, atomic-write kernel.
- Workspace skeleton (Phase 2): `_testatlas/` with 14 canonical documents and 23 subdirectories.
- Commands (Phases 3–4): 30 `/atlas:*` commands covering init, validate, explore (11 sub-explorers), test (10 types), issue lifecycle, reporting, handoff, cleanup.
- Utility scripts (Phase 5): 12 scripts with shared `scripts/lib/`, `validate-workspace` with `--auto-heal`.
- Adapters (Phase 6): 7 agent adapters generated via `assemble-adapter.js`, per-adapter capability matrix, adapter-parity CI gate.
- Distribution (Phase 7): 3 install paths (`npx`, `install.sh`, `git clone`), atomic update with backup/rollback, migration framework, workspace lockfile, `--verify-signature` cosign verification, cross-platform CI matrix.
- Examples (Phase 8): 5 example workspaces with deterministic-replay engine (`regenerate-example.js`).
- Auto-generated docs (Phase 8): `docs/COMMANDS.md`, `docs/SCHEMAS.md`, examples gallery, `docs/MONOREPO.md`.
- Phase 9 — Agentic Workflow Completeness: `subagent-spawn` capability, sub-agent orchestration on 4 umbrella commands + 11 sub-explorers, cross-reference integrity test, E2E pipeline harness, 18-adapter capability matrix.

### Changed

- `package.json#version`: `0.1.0` → `1.0.0`. First version shipping to npm.
- GitHub org placeholder finalized to `testatlas-dev`.
- 9 adapters declare `subagent-spawn` (claude-code, opencode, kilocode, codex, gemini-cli, github-copilot, cline, kiro, sourcegraph-amp).
- Canonical command graph in templates (`/atlas:explore` → `/atlas:map-domains` → `/atlas:plan`).

### Removed

- All "Phase X ships this", "(deferred to v2)", and "(coming in Phase X)" framings from tracked content.

### Security

- npm publish via Trusted Publishing (OIDC); SLSA Build L3 provenance.
- GitHub Releases ship signed sigstore bundle.
- Two-tree invariant: `update.js` writes only to `.testatlas/`; never touches `_testatlas/` except via migration `up()` functions.
- POSIX `install.sh` partial-pipe protection via `_main "$@"` sentinel.

## [0.1.0] - 2026-05-04

First public-ready cut. Phase 0–7 complete.

### Added

- `npx testatlas init` one-liner with adapter auto-detection.
- POSIX `install.sh` curl-pipe installer, shellcheck-clean, partial-pipe sentinel.
- `git clone && node install.js <target>` offline-capable path.
- `node uninstall.js` with `--purge`, `--force-untracked`, `--dry-run`.
- 18th JSON Schema: `install-manifest.schema.json`.
- `node update.js` atomic self-update with backup, rollback, SIGINT safety.
- Migration framework: forward-only, idempotent, N→N+1 with long-jump composition.
- Workspace lockfile with PID + age dual stale detection.
- GitHub Releases auto-check, version pinning, `--verify-signature` cosign verification.
- Cross-platform CI matrix: Linux/macOS/Windows × Node 20.x/22.x/24.x.
- Release pipeline with OIDC Trusted Publishing + provenance + sigstore sidecar.

### Changed

- `package.json`: removed `private: true`, bumped to `0.1.0`, added `publishConfig`.
- Config schema: added `pinnedSince` and `pinAlertThresholdDays`.

### Schema migration

None — baseline schemaVersion: 1.

### Security

- npm publish via Trusted Publishing (OIDC); SLSA Build L3 provenance.
- GitHub Releases ship signed sigstore bundle.
- Two-tree invariant enforced.
- POSIX `install.sh` partial-pipe protection.
