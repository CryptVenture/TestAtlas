# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

## [2.0.0] - 2026-05-09

TestAtlas v2.0.0 is a major release introducing the **Multi-Agent Quality Intelligence Brain** — a persistent, machine-readable quality layer that turns any capable AI agent into a product-understanding, exploration, and evidence-collection system. V2 adds 41 new commands, 18 new schemas, 14 system personas, 11 council commands, and full support across all 18 host adapters.

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

### Security

- npm publish via Trusted Publishing (OIDC); SLSA Build L3 provenance.
- GitHub Releases ship signed sigstore bundle.
- Two-tree invariant enforced.
- POSIX `install.sh` partial-pipe protection.
