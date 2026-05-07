# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

### Added

- **Phase 14 / Plan 14-02 — V2 Multi-Agent Quality Intelligence Brain (Wave 2: runtime scripts + 8 core commands).** Built the executable backbone of V2 so agents can validate, sync, query, and consolidate the brain.
  - **Scripts** (`scripts/`): 13 V2 scripts. `validate-brain.js` upgraded from Wave 1 stub to full AJV validation against V2 schemas (manifest, state, coverage, graph + per-line JSONL for events and claims), introducing the new `BRAIN_SCHEMA_VIOLATION` finding code. `sync-markdown-json.js` reconciles `_testatlas/domains/<slug>/domain.{md,json}` with `brain/domains.json`, idempotent, preserves human prose outside `<!-- TESTATLAS:GENERATED -->` markers. `index-artifacts.js` rebuilds brain indexes by scanning `_testatlas/{domains,flows,to_fix,evidence}/` and refreshes `state.json` counts. `create-persona.js` writes `_testatlas/agents/personas/<type>/<id>.{md,json}`, AJV-validates against `persona.schema.json` before write, updates `brain/personas.json`. `create-domain.js` enhanced (V2-aware): when `_testatlas/brain/` is present, also updates `brain/domains.json` and bumps `brain/state.json` counts.domains. `append-event.js` allocates monotonic `EVENT-N` IDs and AJV-validates each line against `event.schema.json` before appending. `generate-report.js` now exports `generateV2Report()` rendering `REPORT-latest.md` with all PRD §16.1 sections from brain JSON. `bundle-context.js` builds scoped `context_bundle.md` for persona × session × scope. `redact-evidence.js` scans evidence for 13 secret patterns (AWS, GitHub PAT/secret/server/user/refresh, npm, Slack bot/user, JWT, PRIVATE KEY, AWS_SECRET, ?token=) and writes redacted copies under `evidence/redacted/`. `consolidate-council.js` reads session claims/votes/disagreements and writes `followups.md` + updates `brain/decisions.json`. `update-brain-after-command.js` automates the post-operation brain update path (event append + `state.last_command` bump + optional `--reindex`).
  - **Schemas** (`.testatlas/schemas/`): `issue.schema.json` extended with 7 optional V2 fields (`discoveredByPersona`, `brainClaimIds`, `driftSensitivity`, `automationCandidate`, `councilConsensusLevel`, `evidenceStrength`, `retestPackPath`); `flow.schema.json` extended with 9 optional V2 fields (`routeCoverage`, `dataLifecycle`, `apiEndpointsTouched`, `backgroundJobsTouched`, `personasConsulted`, `relatedCouncilSessions`, `qualityScore`, `automationCandidate`, `driftStatus`). All V2 fields are optional; absent values are omitted (not null). V1 records continue to validate.
  - **Commands** (`.testatlas/commands/core/`): 8 new V2 core command instructions — `status.md`, `bootstrap-refresh.md`, `brain-sync.md`, `brain-validate.md`, `brain-query.md`, `brain-compact.md`, `brain-export.md`, `init.md`. Each carries the bootstrap-first preamble citing `.testatlas/bootstrap.md`, frontmatter capability declarations, ≤1500 words, and a documented post-operation brain update path. Lives in a new `core/` subdirectory so V1's flat `listCommandFiles` enumeration is unaffected — V2 enumeration uses the new `test/commands/bootstrap-preamble.test.js` enforcer.
  - **Tests** (12 new files, ~40 new assertions): `test/scripts/validate-brain.test.js`, `sync-markdown-json.test.js`, `create-persona.test.js`, `create-domain.test.js`, `append-event.test.js`, `generate-report.test.js`, `bundle-context.test.js`, `redact-evidence.test.js` (13 secret patterns), `consolidate-council.test.js`, `update-brain-after-command.test.js`; `test/commands/bootstrap-preamble.test.js` (5 assertions covering presence, preamble, frontmatter, word budget, post-op documentation across all 8 core commands). Plan 14-02 total GREEN: 19 (Task 1) + 17 (Task 2) + 8 (Task 3) = 44 new tests, all passing. Zero new regressions in the broader 1367-test sweep (the 22 pre-existing failures from Wave 1 remain unchanged).
  - **docs/SCHEMAS.md** regenerated to reflect new optional V2 fields on `issue` and `flow`.
  - Backward compatibility: V1 schemas remain valid (V2 fields are additive optional). V1 commands are untouched. The new V2 commands live in `core/` so V1 frontmatter / preamble / budget tests (which enumerate flat `.testatlas/commands/`) keep passing without modification.

- **Phase 14 / Plan 14-01 — V2 Multi-Agent Quality Intelligence Brain (Wave 1: schemas, vocabulary, templates, validators).** Closed the gap between Wave 0 schema stubs and production-ready V2 contracts.
  - **Schemas** (`.testatlas/schemas/`): added 4 gap schemas — `story.schema.json`, `coverage.schema.json`, `dashboard_data.schema.json`, `retest_pack.schema.json` — and the brain graph schema `relationship.schema.json` defining all 16 PRD §11.2 relationship types as an enum (`domain-contains-flow`, `flow-touches-route`, `flow-touches-component`, `flow-calls-endpoint`, `flow-depends-on-integration`, `issue-affects-flow`, `issue-affects-domain`, `evidence-supports-issue`, `evidence-supports-claim`, `claim-originates-from-transcript`, `decision-resolves-disagreement`, `persona-participated-in-council`, `story-defines-expected-behavior-for-flow`, `test-scenario-validates-flow`, `drift-invalidates-confidence`, `risk-blocks-release`). Total V2 schemas: 18 (13 Wave 0 + 5 Wave 1). Total live schemas in suite: 38 (20 V1 + 18 V2).
  - **Vocabulary** (`.testatlas/vocabulary.json`): added 7 V2 `$defs` entries — `claim_type`, `council_type`, `drift_status`, `persona_type`, `message_type`, `disagreement_type`, `vote_value` — per PRD §10.3 / §12.5 / §12.6. V1 entries unchanged. Total: 33 (26 V1 + 7 V2). `claim.schema.json` now uses cross-file `$ref` into `vocabulary.json#/$defs/claim_type` (resolved via `loadAllSchemas`).
  - **Templates** (31 new files): council session artifacts (15, PRD §7.8: `session.md`, `prompt.md`, `context_bundle.md`, `participants.json`, `transcript.{md,jsonl}`, `claims.jsonl`, `disagreements.md`, `votes.json`, `consolidation.{md,json}`, `followups.md`, `generated_{issues,flows,questions}.md`); persona templates (3, PRD §7.7: `system.md`, `generated.md`, `project.md` — each carrying all 11 mandatory headings); report templates (4: `quality_scores.md`, `drift.md`, `dashboard-data.json`, `release_readiness.md`, with TESTATLAS:GENERATED markers); artifact markdown (8: `domain-v2.md`, `flow-v2.md`, `issue-v2.md`, `story.md`, `evidence_index.md`, `explorer_report.md`, `command_definition.md`, `adapter_pack.md`).
  - **Validator** (`scripts/validate-brain.js`): stub validator for the V2 brain. Checks all 22 brain files (19 JSON + 3 JSONL) for presence, parseability, and minimum top-level fields on `manifest.json` + `state.json`. Exports `validateBrain({ cwd })` plus a CLI entrypoint. Five finding codes (`BRAIN_DIR_MISSING`, `BRAIN_FILE_MISSING`, `BRAIN_JSON_PARSE_ERROR`, `BRAIN_JSONL_PARSE_ERROR`, `BRAIN_REQUIRED_FIELD_MISSING`). Wave 2 will replace with full AJV validation.
  - **Tests** (4 new + 3 extended): `test/v2-schemas.test.js` (16 tests, was 6: full property/parity/$ref/PRD-fixture coverage); `test/schema-template-parity-v2.test.js` (7 tests, schema↔template field parity); `test/brain-validation.test.js` (7 tests, validator behavior); `test/graph-relationship.test.js` (6 tests, relationship enum + graph.json validation). Plan total: 51/51 GREEN. `test/schemas/schema-id-convention.test.js` and `test/schemas/schema-vocabulary-refs.test.js` extended to recognize V2 namespace + V2 vocabulary entries (no V1 regressions).
  - **docs/SCHEMAS.md** regenerated by `scripts/generate-schemas-doc.js` to include the 5 new schemas.
  - Backward compatibility: V1 schemas + V1 vocabulary entries untouched (additive-only). All Wave-0 tests continue passing.

- **Phase 13 — Chrome DevTools MCP UI Walkthrough Coverage.** The 7 UI-touching commands (`explore-ui`, `explore-accessibility`, `explore-performance`, `test-flow`, `test-domain`, `test-accessibility`, `test-performance`) now embed a **mandatory-when-available walkthrough contract**: when `browser` AND `MCP` capabilities are both available, the canonical Chrome DevTools MCP toolset MUST drive the full walkthrough described in `.testatlas/reference/chrome-devtools-mcp.md` (component-discovery, state-coverage, interactive-surface, a11y, performance patterns + the 5-state PRD §13.1 matrix + tool tiering Tier 1–4). Skipping a walkthrough step when the underlying tool is reachable is now a contract violation equivalent to fabricating evidence.
- Phase 13 / Plan 13-02: new reference shard `.testatlas/reference/chrome-devtools-mcp.md` housing the 5 walkthrough patterns, state-coverage matrix, tool tiering, and Strategy A evidence-persistence mapping. Four new regression tests (`walkthrough-mandatory.test.js`, `walkthrough-toolset.test.js`, `walkthrough-state-coverage.test.js`, `frontmatter-walkthrough-description.test.js`) assert the contract.
- Phase 13 / Plan 13-03: bootstrap.md §12 carries the positive-side mandatory-when-available walkthrough rule pointing at `reference/chrome-devtools-mcp.md`. `reference/capabilities.md` per-capability action matrix gains a fourth column ("Mandatory action when available") covering all six capabilities.
- Phase 13 / Plan 13-09: new `test/mcp-server-walkthrough-description.test.js` — asserts each of the 7 UI-touching prompts in `mcp-server-manifest.json` carries the walkthrough phrase in its description (visible to MCP-aware clients in their picker UI). Symmetric guard rejects accidental leak into non-UI prompts.
- Phase 13 / Plan 13-09: extended `test/adapter-aider.test.js` with a Phase 13 regression — asserts the concatenated `.testatlas/adapters/aider/CONVENTIONS.md` preserves the `code-reading` degrade prose, proving the documented fallback path for non-browser hosts (Aider, generic, etc.) survives the rewrite.

### Changed

- Phase 13 / Plans 13-04..13-07: 7 UI-touching command bodies rewritten with a reference-shard link in Required First Reads, a new Required Action paragraph (mandatory-when-available), Tier-1/2/3/4 toolset retention/expansion (incl. `handle_dialog`, `hover`, `type_text`, `upload_file` newly added to `explore-ui.md`), and (for `explore-ui.md` + `test-domain.md` state branch) the 5-state matrix prose with verbatim trigger techniques (`emulate`, `Slow 3G`, `handle_dialog`).
- Phase 13 / Plan 13-07: `test-flow.md` capability declaration extended to include `MCP` (was `[shell, browser, file-write]`; now `[shell, browser, MCP, file-write]`).
- Phase 13 / Plan 13-08: 7 UI-touching command frontmatter `description` fields rewritten to mention walkthrough discipline (visible to MCP-aware clients via the manifest, surfaced in adapter prompt menus).
- Phase 13 / Plan 13-09: all 18 adapter trees regenerated via `node scripts/assemble-adapter.js` to propagate the canonical command rewrites (96 derived files updated; idempotency held — `--check` exits 0).

### Backward compatibility

- The code-reading degrade path is preserved verbatim for non-browser hosts (Aider, generic, etc.). `capability-fallback.test.js`, `anti-hallucination.test.js`, and the new `adapter-aider.test.js` Test 9 each assert this. No `vocabulary.json` schema change (Strategy A — existing `evidenceType` enum values cover all walkthrough artifacts). All 18 adapter manifests + the 32-command roster remain intact (no commands added or removed in Phase 13).

### Removed

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

- **BREAKING — `validate-workspace --auto-heal` now applies by default** (Quick 260506-nj2). The CLI flag previously required pairing with `--apply` to actually persist heals; users who ran `--auto-heal` alone saw "Would apply (N)" and (correctly) concluded nothing changed. The dual-flag UX caused real-world reports to be filed as "autoheal not working." With v1.2.0, bare `--auto-heal` writes to disk; pass `--dry-run` for preview. The `--apply` flag is now a documented no-op (kept parseable for back-compat) and emits a one-time stderr note when paired with `--auto-heal`. **Migration:** if you have CI / scripts that ran `validate-workspace --auto-heal` expecting preview-only behavior, add `--dry-run` to keep the old semantics. The programmatic `validateWorkspace({autoHeal, apply, dryRun})` API is unchanged — only the CLI default flipped.
- **`scripts/lib/adapters/render-mcp.js` requires explicit `version` parameter** (Quick 260506-nj2). The renderer previously hardcoded `version: '1.0.0'` regardless of project version, so every release shipped an mcp manifest claiming v1.0.0 (the parity-check refresh masked it locally per release). The renderer now `throw new TypeError`s if `version` is omitted; `scripts/assemble-adapter.js` reads `<workspace>/package.json#version` and injects it, so the published mcp manifest correctly tracks the suite version (v1.2.0 ships `"version": "1.2.0"`).

### Fixed

- **High-severity — `runUpdate` now executes full adapter upgrade lifecycle for all 7 adapters** (ISSUE-030; Quick 260506-mgr). Atomic-swap previously only renamed `.testatlas/`. Adapter outputs that live OUTSIDE the suite tree (`.claude/commands/atlas-*.md` for claude-code, `.cursor/rules/*.mdc` for cursor, `AGENTS.md` for opencode/generic, `.aider/CONVENTIONS.md` for aider, mcp-server config, kilo equivalents) were never re-emitted on update — every consumer-side update from v1.0.0 onward left those files at install-time bodies forever. `regenerateInstallManifest` walked only `.testatlas/`, dropping adapter files from the regenerated manifest and silently disabling drift detection + clean uninstall for them. v1.2.0 adds a `restageAdapters` helper invoked between tarball cleanup and manifest regen: re-emits all adapter command files from the new tarball via `copyAdapterCommandFiles`, prunes orphaned entries (files removed in vNext), honors `manifest.mode === 'global'`, and includes the re-emitted entries in the regenerated manifest with correct `type`. Per-adapter try/catch — one bad adapter does not abort the rest. **Action required for users on v1.0.0–v1.1.5:** run `npx @webventures/testatlas update --force-reinstall` once after updating to v1.2.0 to refresh the adapter command files in your repo. Subsequent updates will refresh them automatically.
- **Reporter preview subtitle now appears under the section header** (Quick 260506-nj2). When `--auto-heal --dry-run` is used (preview mode), the report previously only showed a per-row footer "Preview only" note. Users skimming the section header could miss the indicator. v1.2.0 adds a section-header subtitle directly under `### Would apply (N)` so the preview-only state is unmissable. Footer wording updated from "re-run with `--apply`" to "re-run without `--dry-run`" to match the new flag semantics. No change when `applied.length === 0` (nothing to preview).

### Added

## [1.1.5] - 2026-05-06

_No notable changes since 1.1.4._

## [1.1.4] - 2026-05-06

_No notable changes since 1.1.3._

## [1.1.3] - 2026-05-06

_No notable changes since 1.1.2._

## [1.1.2] - 2026-05-06

_No notable changes since 1.1.1._

## [1.1.1] - 2026-05-06

_No notable changes since 1.1.0._

## [1.1.0] - 2026-05-06

### Added

- **Cosign + dogfood-test infrastructure** (Quick 260506-07b). `sigstore/cosign-installer@v3` (SHA-pinned) wired into `.github/workflows/ci.yml` so dogfood scenarios run against a real cosign install. New `scripts/setup-dogfood-env.sh` POSIX pre-flight probes for cosign + shellcheck + gh + sha256sum + tar + git + curl + jq + node ≥ 20; copy-paste install hints per missing binary; optional `--install` flag attempts non-interactive install on Linux.
- **`CONTRIBUTING.md` Dogfood Test Prerequisites section** (Quick 260506-07b). Documents required binaries with version floors; tells contributors to run `sh scripts/setup-dogfood-env.sh` before `/atlas:test-flow --all`; notes CI installs these automatically.
- **NEW scenario `TEST-install-cosign-absent-degrade`** (Quick 260506-07b). Verifies install.sh's fail-open default path: when `TESTATLAS_VERIFY_SIGNATURE` is unset and cosign is not on PATH, installer proceeds with sha256-only verification (exit 0). Sibling to `TEST-install-cosign-verification-smoke` (tamper-fail focus). Scenario count 25→26.
- **Per-area report views** (Quick 260506-dyb G5). `scripts/generate-report.js` now emits `_testatlas/reports/regressions.md`, `readiness.md`, `coverage.md`, `quality_risks.md` from the same aggregation pass. Previously these were declared in the spec but never written.
- **`counts.reports` field** in `workspace-manifest.schema.json` (Quick 260506-dyb G4). Optional integer ≥0 added additively (no migration required); HEAL-01 + check-status-counts updated to validate it; `sync-status.js` writes it from disk truth (`_testatlas/reports/REPORT-*.md` count).
- **`scripts/triage.js` accelerator** (Quick 260506-esm). Production-grade idempotent triage driver mirroring `scripts/create-issue.js` shape. Loads all `_testatlas/to_fix/ISSUE-*.json`; verifies evidence-on-disk per issue (downgrades confidence to `needs-validation` if missing); applies 3 duplicate heuristics (exact-title, shared-evidence path, same-domain+flow+repro Levenshtein ≥0.8); transitions `status:new` → `status:triaged` with append-only history; AJV-validates every mutated record before atomicWrite; regenerates `triage-report-<ts>.md` + `blockers.md` + `groups.md`. CLI flags: `--workspace`, `--cwd`, `--dry-run`, `--severity-override <ID>=<sev>` (repeatable), `--help`. Idempotent: live runs against a stable corpus produce zero file mutations.
- **POSIX banner in `install.sh`** (Quick 260506-h9q). New `_print_banner()` emits the same 9-line ASCII art as `scripts/lib/banner.js BANNER_UNICODE_LINES`; honors `NO_COLOR` (no ANSI when set), `NO_UNICODE` (`#`-art fallback), and non-TTY (no escape codes). Banner now renders on the curl-pipe path, matching the npx + git-clone + direct-script paths.
- **`renderBanner` wired into `install.js`, `scripts/update.js`, `scripts/uninstall.js`** (Quick 260506-h9q). Previously only `bin/testatlas.js` (npx path) rendered the banner. All entry-points now consistent.
- **Production-grade release driver** (Quick 260506-hqu). Refactored `scripts/bump-version.js` (770 LOC) is now a true one-liner: pre-flight gates (`pnpm test` + `check-adapter-parity --strict` + `validate-workspace`), CHANGELOG `[Unreleased]` → `[X.Y.Z]` body migration, atomic commit + annotated tag, `git push origin <branch>` + `git push origin <tag>`, `gh release create vX.Y.Z --notes-file <CHANGELOG-extract>` (NOT `--generate-notes`), optional `--wait` polls `release.yml` until OIDC publish + asset attachment completes (10-min timeout). Fires the existing `release.yml` workflow which handles npm publish via OIDC, sha256 + sigstore fetch, install.sh `TARBALL_SHA256` sync, and asset attachment automatically.
- **`docs/RELEASE.md` "Local release driver" section** (Quick 260506-hqu). Documents the canonical `node scripts/bump-version.js --minor --release --wait` flow + every flag with examples + OIDC vs bootstrap path tradeoff.

### Changed

- **`scripts/generate-report.js` readiness verdict** (Quick 260506-esm) now filters `sortedIssues` to `status ∉ {closed, wont_fix}` BEFORE the severity check. Previously counted closed issues toward CONDITIONAL verdict; now correctly reads READY when 0 critical+open AND 0 high+open. Closes ISSUE-029.
- **`scripts/generate-report.js` run dedup** (Quick 260506-dyb G1). `readTestRuns` groups by RUN-`<ts>` stem; prefers `.json` sidecar; merges `.md` frontmatter as supplementary. Previously read each run twice (once via .md glob, once via .json glob), reporting `2 run(s)` for 1 actual run.
- **`scripts/generate-report.js` per-domain coverage detection** (Quick 260506-dyb G2). Walks `r.parsed.scenariosRun[].domain` instead of the (non-existent) top-level `r.parsed.domain` field. Previously claimed all domains uncovered; now correctly credits scenario coverage.
- **`scripts/generate-report.js` Test Pyramid type-classification** (Quick 260506-dyb G3). Resolves scenario `type` via matching `_testatlas/tests/scenarios/TEST-<id>.json` sidecar. Previously emitted `unknown: N` bucket only; now reflects actual smoke/regression/state/negative/setup/integration/user-flow distribution.
- **`scripts/generate-report.js` autoheal parity** (Quick 260506-esm). HEAL-01 now recomputes `counts.reports` alongside the other counts when re-deriving manifest from disk; previously only check-status-counts validated it but heal didn't fix mismatches.
- **`.testatlas/commands/triage.md` Preferred-path entry** (Quick 260506-esm). Source command now declares `node .testatlas/scripts/triage.js` as the preferred-when-shell-available path, mirroring `create-issue.md` / `generate-report.md` patterns. 18 adapter trees regenerated.
- **`install.sh` line budget** raised 250→290 (Quick 260506-h9q) to accommodate the `_print_banner` shell function. Banner code itself was tightened to ~30 lines via inline color/unicode tests + printf loop.
- **`test/release/pack-contents.test.js`** ceiling raised 5MB→8MB (Quick 260506-dyb side-effect). Per-area views library + adapter regens nudged the pack size past the prior 5MB ceiling.
- **`scripts/sync-status.js`** tightened (Quick 260506-dyb side-effect) — reports counter now matches `REPORT-*.md` files only (excludes per-area views).
- **Bootstrap-token publish path deprecated** in active workflow. `release.yml`'s OIDC path is now the canonical publish route since Trusted Publishing is configured at https://www.npmjs.com/package/@webventures/testatlas/access. The legacy NPM_TOKEN repo secret is no longer used; documented as "remove from repo secrets after first OIDC publish" in `docs/RELEASE.md`.

### Notes

- **Phase 9 + dogfood-loop work shipped at v1.0.0** (per Option A release decision on 2026-05-06). The original `[Unreleased]` Phase 9 content (subagent-spawn capability, sub-agent orchestration on 4 umbrella commands + 11 sub-explorers, cross-reference integrity test, E2E pipeline harness, 18-adapter capability matrix, post-GA framing cleanup) effectively shipped in the v1.0.0 tag at commit `8962859` and is recorded under `[1.0.0]`. This `[Unreleased]` section tracks only post-v1.0.0 dogfood-loop work.
- **Dogfood loop closure** (post-v1.0.0). The framework was tested end-to-end against itself: `/atlas:test-flow --all` against the 26-scenario matrix (RUN-20260505T233506Z) produced 25 passes / 1 environmental block (publishing-release-provenance — unblocks at v1.1.0 via OIDC + sigstore). Six self-bugs surfaced + fixed + filed (ISSUE-024..029); zero observed-but-unrecorded bugs remain in the framework's own surface; readiness verdict naturally READY (0 blockers · 0 open critical/high · 5 open issues all medium/low/triaged).
- **Test count delta v1.0.0 → v1.1.0:** 1071 → 1141 (+70 net new across 6 Quicks).

## [1.0.0] - 2026-05-04

First production GA release. Closes Phase 8 (examples + auto-doc generators + GA polish) and consolidates everything from the 0.1.0-pre baseline through the v1 requirement set (98/98 Complete).

### Added

- **Bootstrap & Constitution** (Phase 1): `.testatlas/bootstrap.md` constitution under the 3000-word budget; capability-aware degradation rule; full config layer (`default.config.json` + `config.schema.json` + project override).
- **Schemas & Templates** (Phase 2): 18 JSON Schemas (Draft 2020-12) + `vocabulary.json`; markdown templates for every workspace artifact; generated-section markers with defensive parser; atomic-write kernel.
- **Workspace skeleton** (Phase 2): `_testatlas/` with 14 canonical documents and 23 top-level subdirectories; manifest counts; lifecycle file conventions.
- **Commands** (Phase 3+4): 30 `/atlas:*` commands covering init, validate, explore (×11 sub-explorers: ui, cli, api, codebase, runtime, data, docs, integrations, accessibility, performance, security), test (×10 types), issue lifecycle (log/triage/retest), reporting, lifecycle/handoff/cleanup.
- **Explorers, tests, issues, reports** (Phase 4): 11 explorers + 10 test types + issue lifecycle + reporting. Domain-aware mapping; `confidence: needs-validation` discipline.
- **Utility scripts** (Phase 5): 12 utility scripts with shared `scripts/lib/` (atomic-write, content-hash, slug, frontmatter parser, schema-loader, all-workspaces); `validate-workspace` covers the full PRD §33 condition set; `--auto-heal` repair mode.
- **Adapters** (Phase 6): 7 agent adapters (Claude Code canonical, Generic, OpenCode, KiloCode, Cursor, Aider, MCP) generated via `assemble-adapter.js`; per-adapter capability matrix; adapter-parity CI gate.
- **Distribution** (Phase 7): 3 install paths (`npx`, `install.sh`, `git clone`); atomic update with backup + rollback; migration framework (forward-only, idempotent, N→N+1 with long-jump composition); workspace lockfile (PID + age dual stale detection); `--verify-signature` opt-in cosign verification; cross-platform CI matrix (Linux/macOS/Windows × Node 20/22/24).
- **Examples** (Phase 8): 5 example workspaces — `nextjs-saas` (EX-01), `node-api` (EX-02), `cli-tool` Aider-only (EX-03 + EX-07), `monorepo` (EX-04), `mobile-web-hybrid` (EX-05). `scripts/regenerate-example.js` deterministic-replay engine. `example-script.schema.json` (19th schema). CI matrix runs `regenerate-example --check` + `validate-workspace` per example on every PR (closes EX-06 + VAL-02). `--all-workspaces` flag for monorepo orchestration.
- **Auto-generated docs** (Phase 8): `docs/COMMANDS.md` (auto-generated from `.testatlas/commands/*.md`, 30 sections, drift-detected in CI); `docs/SCHEMAS.md` (auto-generated from `.testatlas/schemas/*.schema.json`, 19 sections); `examples/README.md` gallery; `docs/MONOREPO.md` documenting the hybrid pattern; final GA README structure.
- **Pre-flight checks** (Phase 8): `scripts/check-org-placeholder.js` greps for the literal angle-bracketed `org` placeholder string and exits non-zero if any are found in active code (excludes `node_modules`, `.git`, `.planning`, `dist`, `build`, `coverage`, `.next`, `.expo`, `.testatlas.bak.*`).
- **Phase 9 — Agentic Workflow Completeness Audit + Sub-Agent Orchestration.** Closes the post-v1.0 agentic completeness work surfaced after GA across 5 plans (09-01 through 09-05).
- `subagent-spawn` capability vocabulary entry (6th entry; locked) — declared in `vocabulary.json` `$defs/capability` and consumed by `command-instruction.schema.json` and `adapter-capabilities.schema.json` via `$ref`.
- `bootstrap.md` Capability Degradation block + per-host invocation table covering all 18 adapters with their canonical 2026 sub-agent invocation pattern.
- `## Sub-Agent Orchestration` blocks on the 4 umbrella commands (`/atlas:explore`, `/atlas:plan`, `/atlas:test-flow`, `/atlas:consolidate`) — parallel sub-agent spawning when host capability is available, sequential-fallback otherwise.
- `## Sub-Agent Task Brief Contract` sections on the 11 sub-explorer commands so they work both as parallel children of an umbrella and as standalone slash invocations.
- `## What's Next` tail navigation on all 30 command files + `README.md` + `docs/GETTING_STARTED.md` + `docs/INSTALL.md` + `docs/UPDATE.md`.
- Cross-reference integrity test (`test/agentic/cross-reference-integrity.test.js`) gating the test suite — every `/atlas:NAME` mention, every relative `.md` link, every schema `$id` URL must resolve to a real file on disk.
- E2E pipeline harness `scripts/e2e/run-node-api-graph.js` exercising the full command graph (init → explore → map-domains → plan → test-flow → report) in both `parallel-subagents` and `sequential-fallback` modes against `examples/node-api/`. Companion env-gated tests (`TESTATLAS_E2E=1`) at `test/agentic/e2e-pipeline.test.js`.

### Changed

- First production release. The previous `0.1.0` baseline (Phase 7 closure) is collapsed into this `1.0.0` entry — every artifact landed by Phases 1–7 is part of the v1.0.0 surface.
- `package.json#version`: `0.1.0` → `1.0.0`. The repo also collapsed the prior `0.1.0-pre` and `0.1.0` markers; `1.0.0` is the first version that ships to npm.
- The angle-bracketed GitHub-org placeholder (the pre-GA stand-in) finalized to `testatlas-dev` across `package.json`, `install.sh`, `install.js`, `scripts/lib/constants.js`, `scripts/lib/update-check.js`, README, and the docs gallery.
- 9 adapters now declare `subagent-spawn` in `.testatlas/adapters/adapter-capabilities.json` (claude-code, opencode, kilocode, codex, gemini-cli, github-copilot, cline, kiro, sourcegraph-amp). The other 9 (cursor, continue-dev, aider, generic, mcp, windsurf, roo-code, zed, amazon-q) remain documented as no-spawn (sequential-fallback only).
- `.testatlas/templates/canonical/03_execution_status.md` "Next Highest-Value Steps" rewritten to use the canonical command graph (`/atlas:explore` → `/atlas:map-domains` → `/atlas:plan`) instead of legacy never-implemented command names that previously appeared there.
- Eight explorer/map-domains commands updated to reference the canonical `01_system_map.md` instead of the never-bootstrapped `01_app_inventory.md`.

### Removed

- All "Phase X ships this", "(deferred to v2)", "(coming in Phase X)", and "Phase X not yet installed" framings from tracked `.md` content. Post-v1.0 framing is now consistent across `README.md`, the 12 `docs/*.md`, the 30 command files, and the 18 adapter trees.

### Notes

- **npm publish via Trusted Publisher (OIDC).** First publish (v1.0.0) uses a one-shot `NPM_TOKEN` (granular access token, package-scoped, 7-day expiry) because Trusted Publishing requires the npm package to exist before a trust relationship can be declared. After v1.0.0 lands, the maintainer configures Trusted Publishing at https://www.npmjs.com/package/testatlas/access and revokes the bootstrap token. v1.0.1+ uses OIDC only. See `docs/RELEASE.md` § "Trusted Publisher (one-time setup)" for the full chicken-and-egg path.
- **GitHub Releases tarball includes cosign sigstore sidecar** (`.tgz.sigstore.json`) per UPDATE-07. `--verify-signature` opt-in flag triggers cosign attestation verification at install/update time.
- **Examples are NOT shipped in the npm tarball.** `package.json#files` is a positive whitelist (`bin/`, `install.js`, `install.sh`, `scripts/`, `.testatlas/`, `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`); `examples/` lives in the GitHub repo only.

### Schema migration

- None. v1.0.0 is the baseline `schemaVersion: 1`. The first migration (`schemaVersion: 1 → 2`) arrives with a future minor or major release.

### Security

- npm publish via Trusted Publishing (OIDC); SLSA Build L3 provenance via `--provenance`.
- GitHub Releases ship signed sigstore bundle as sidecar (`testatlas-1.0.0.tgz.sigstore.json`).
- Two-tree invariant enforced: `update.js` writes only to `.testatlas/` (suite swap); never touches `_testatlas/` content except via explicit migration `up()` functions.
- POSIX `install.sh` partial-pipe protection via `_main "$@"` sentinel pattern.
- Default verification path is `npm audit signatures` (zero-install); `--verify-signature` opts into `cosign verify-blob-attestation` with `certificate-identity-regexp` pinned to the canonical release workflow on a tagged release.

## [0.1.0] - 2026-05-04

First public-ready cut of TestAtlas. Phase 0–7 complete; Phase 8 (examples + GA publish) follows.

### Added

- `npx testatlas init` one-liner (Plan 07-01) with adapter auto-detection (`.claude/`, `.cursor/`, `.aider.conf.yml`, `kilocode/`, `.opencode/`, `mcp` signals); `--all-adapters` flag installs all 7.
- POSIX `install.sh` curl-pipe installer (Plan 07-02), <200 lines, shellcheck-clean, partial-pipe sentinel (`_main "$@"` last-line idiom).
- `git clone && node install.js <target>` offline-capable install path.
- `node uninstall.js` (`--purge`, `--force-untracked`, `--dry-run`); preserves `_testatlas/` by default; manifest-driven precision.
- 18th JSON Schema: `install-manifest.schema.json` (Draft 2020-12) tracks every installed file with content hash.
- `node update.js` atomic self-update (Plan 07-03): stage → migrate → swap → backup → prune; rollback on failure; SIGINT-safe.
- Migration framework: forward-only, idempotent, N→N+1 with long-jump composition. v0.1.0 ships with no migrations; framework ready for v0.2.0+.
- Workspace lockfile (`_testatlas/.lock`): PID + age dual stale detection.
- GitHub Releases auto-check (Plan 07-04): configurable TTL (default 24h), offline-tolerant, rate-limit-aware.
- Version pinning + stale-pin warnings: `pinnedVersion`, `pinnedSince`, `pinAlertThresholdDays` config fields.
- `--verify-signature` opt-in cosign attestation verification.
- Cross-platform CI matrix: Linux/macOS/Windows × Node 20.x/22.x/24.x.
- Phase 7 release pipeline (`.github/workflows/release.yml`): npm Trusted Publishing (OIDC) + provenance + post-publish install.sh sed-and-commit + GitHub Release sigstore sidecar attach + workflow_dispatch dry-run trigger.
- DIST-01 docs gallery: README install section, docs/INSTALL.md, docs/UPDATE.md, docs/UNINSTALL.md, docs/SIGNING.md, docs/LTS.md, docs/RELEASE.md.
- Phase 0–6 deliverables (already complete in earlier phases): governance + bootstrap + workspace skeleton + 30 commands + 7 adapters + utility scripts + validation gates.

### Changed

- `package.json`: flipped `private: true` → removed; bumped `version` `0.1.0-pre` → `0.1.0`; added `publishConfig: { access: "public", provenance: true }`.
- Existing config schema: added `pinnedSince` (date-time) and `pinAlertThresholdDays` (default 90).
- `.github/workflows/release.yml`: replaced skeleton with full pipeline (workflow_dispatch dry-run + release:published trigger + post-publish install.sh sync + sigstore sidecar attach).

### Schema migration

- None. v0.1.0 is the baseline `schemaVersion: 1`. First migration arrives at v0.2.0.

### Security

- npm publish via Trusted Publishing (OIDC); SLSA Build L3 provenance via `--provenance`.
- GitHub Releases ship signed sigstore bundle as sidecar (`testatlas-<VERSION>.tgz.sigstore.json`).
- Two-tree invariant enforced: `update.js` writes only to `.testatlas/` (suite swap); never touches `_testatlas/` content except via explicit migration `up()` functions.
- POSIX `install.sh` partial-pipe protection via `_main "$@"` sentinel pattern.
- Default verification path is `npm audit signatures` (zero-install); `--verify-signature` opts into cosign verify-blob-attestation with certificate-identity-regexp pinned to the canonical release workflow.
