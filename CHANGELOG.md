# Changelog

All notable changes to this project will be documented in this file. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are managed via `@changesets/cli`.

## [Unreleased]

### Added

- (none yet)

### Changed

- (none yet)

### Deprecated

- (none yet)

### Removed

- (none yet)

### Fixed

- (none yet)

### Security

- (none yet)

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
