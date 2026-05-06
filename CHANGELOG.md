# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

### Added

### Changed

### Removed

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
