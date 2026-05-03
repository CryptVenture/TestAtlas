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
git clone https://github.com/<org>/testatlas
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

## Reporting Issues

For security issues, follow the private disclosure flow described in [SECURITY.md](SECURITY.md). For all other reports, use GitHub Issues.

## Adapter Ownership

Each adapter (Claude Code, OpenCode, KiloCode, Cursor, Aider, MCP, Generic) has at least one owner; see [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md). New adapter contributions need an owner before merge.

## Scope

Read the public scope-rejection list at [docs/SCOPE.md](docs/SCOPE.md) before proposing new features. Proposals that conflict with the scope-rejection list will be closed.

## Bus-Factor and Sustainability

This project is designed to avoid single-maintainer burnout (research/PITFALLS.md Pitfall 14). The bus-factor policy is documented in [ADAPTER-OWNERS.md](ADAPTER-OWNERS.md).
