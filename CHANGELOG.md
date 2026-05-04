# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

### Added

- **Phase 9 — Agentic Workflow Completeness Audit + Sub-Agent Orchestration.** Closes the post-v1.0 agentic completeness work surfaced after GA across 5 plans (09-01 through 09-05).
- `subagent-spawn` capability vocabulary entry (6th entry; locked) — declared in `vocabulary.json` `$defs/capability` and consumed by `command-instruction.schema.json` and `adapter-capabilities.schema.json` via `$ref`.
- `bootstrap.md` Capability Degradation block + per-host invocation table covering all 18 adapters with their canonical 2026 sub-agent invocation pattern.
- `## Sub-Agent Orchestration` blocks on the 4 umbrella commands (`/atlas:explore`, `/atlas:plan`, `/atlas:test-flow`, `/atlas:consolidate`) — parallel sub-agent spawning when host capability is available, sequential-fallback otherwise.
- `## Sub-Agent Task Brief Contract` sections on the 11 sub-explorer commands so they work both as parallel children of an umbrella and as standalone slash invocations.
- `## What's Next` tail navigation on all 30 command files + `README.md` + `docs/GETTING_STARTED.md` + `docs/INSTALL.md` + `docs/UPDATE.md`.
- Cross-reference integrity test (`test/agentic/cross-reference-integrity.test.js`) gating the test suite — every `/atlas:NAME` mention, every relative `.md` link, every schema `$id` URL must resolve to a real file on disk.
- E2E pipeline harness `scripts/e2e/run-node-api-graph.js` exercising the full command graph (init → explore → map-domains → plan → test-flow → report) in both `parallel-subagents` and `sequential-fallback` modes against `examples/node-api/`. Companion env-gated tests (`TESTATLAS_E2E=1`) at `test/agentic/e2e-pipeline.test.js`.

### Changed

- 9 adapters now declare `subagent-spawn` in `.testatlas/adapters/adapter-capabilities.json` (claude-code, opencode, kilocode, codex, gemini-cli, github-copilot, cline, kiro, sourcegraph-amp). The other 9 (cursor, continue-dev, aider, generic, mcp, windsurf, roo-code, zed, amazon-q) remain documented as no-spawn (sequential-fallback only).
- `.testatlas/templates/canonical/03_execution_status.md` "Next Highest-Value Steps" rewritten to use the canonical command graph (`/atlas:explore` → `/atlas:map-domains` → `/atlas:plan`) instead of legacy never-implemented command names that previously appeared there.
- Eight explorer/map-domains commands updated to reference the canonical `01_system_map.md` instead of the never-bootstrapped `01_app_inventory.md`.

### Removed

- All "Phase X ships this", "(deferred to v2)", "(coming in Phase X)", and "Phase X not yet installed" framings from tracked `.md` content. Post-v1.0 framing is now consistent across `README.md`, the 12 `docs/*.md`, the 30 command files, and the 18 adapter trees.

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

### Changed

- First production release. The previous `0.1.0` baseline (Phase 7 closure) is collapsed into this `1.0.0` entry — every artifact landed by Phases 1–7 is part of the v1.0.0 surface.
- `package.json#version`: `0.1.0` → `1.0.0`. The repo also collapsed the prior `0.1.0-pre` and `0.1.0` markers; `1.0.0` is the first version that ships to npm.
- The angle-bracketed GitHub-org placeholder (the pre-GA stand-in) finalized to `testatlas-dev` across `package.json`, `install.sh`, `install.js`, `scripts/lib/constants.js`, `scripts/lib/update-check.js`, README, and the docs gallery.

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
