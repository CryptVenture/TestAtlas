# Contributing to TestAtlas

Thank you for your interest in contributing to TestAtlas. This guide explains how to set up a development environment, run the test and lint workflow, file changesets, and follow project conventions.

## Code of Conduct

This project adopts the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to abide by it.

## Prerequisites

- Node.js >= 20.11.0 (run `node -v` to verify)
- pnpm >= 10 (recommended; npm/yarn also work)
- Git with a configured `user.name` and `user.email`
- (optional) GPG key configured for commit signing — see [Commit Signing](#commit-signing)

## Development Setup

```
git clone https://github.com/CryptVenture/TestAtlas
cd testatlas
pnpm install
pnpm test
```

## Scripts

- `pnpm lint` — runs `biome check .`
- `pnpm format` — runs `biome format --write .`
- `pnpm test` — runs `node --test`
- `pnpm prepare` — sets up `simple-git-hooks` (pre-commit hook runs Biome check)

## Commit Style

This project uses [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, etc.). Commits SHOULD be signed-off where possible (`git commit -s`).

## Commit Signing

Maintainers sign commits via GPG or SSH (`git config commit.gpgsign true`). Contributor commits SHOULD be signed but signing is not enforced if you do not have GPG/SSH signing configured (per Phase 0 decision in `.planning/phases/00-project-foundation-governance/00-CONTEXT.md`).

## Changesets

Run `pnpm changeset` to record a changeset describing your change. Changesets drive `CHANGELOG.md` and version bumps.

## Schema or Command-Contract Changes

If your PR changes a JSON schema, the workspace tree shape, or a public command contract, follow this checklist:

- [ ] Bump the relevant `*.schema.json` `$id` (e.g., `…/v1.schema.json` → `…/v2.schema.json`).
- [ ] Add a migration file at `.testatlas/migrations/v<N>-to-v<N+1>.js` exporting an idempotent async `up({ workspaceDir, suiteDir })` function.
- [ ] Add a CHANGELOG entry under "Changed" with the prefix `Schema migration: v<N>→v<N+1> …`.
- [ ] Add or update fixtures so the long-jump CI test (`v1 → current`) passes.
- [ ] Update DIST-03 traceability if changing the public command contract.
- [ ] Document the breaking-change type in your changeset (`major` if no migration; `minor` with migration).

The migration framework's contract — forward-only, idempotent, N→N+1 — is non-negotiable. If you can't write an idempotent `up()`, the change isn't ready.

## LTS Strategy

We support the current major and the previous major (security backports only on previous; new features only on current). See [docs/LTS.md](docs/LTS.md) for the full policy. When proposing a change:

- Bug fixes and security patches that apply to the previous major: cherry-pick after merging on `main`. Open a separate PR titled `[backport <previous-major>] …`.
- New features land on `main` only.
- Major-breaking changes wait for the next planned major release.

## Reporting Issues

For security issues, follow the private disclosure flow described in [SECURITY.md](SECURITY.md). For all other reports, use GitHub Issues.

## Adapter Ownership

Each adapter (Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP, Generic) has at least one owner; see [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md). New adapter contributions need an owner before merge.

## Scope

Read the public scope-rejection list at [docs/SCOPE.md](docs/SCOPE.md) before proposing new features. Proposals that conflict with the scope-rejection list will be closed.

## Bus-Factor and Sustainability

This project is designed to avoid single-maintainer burnout (research/PITFALLS.md Pitfall 14). The bus-factor policy is documented in [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md).
