# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — small
markdown files describing changes that should appear in `CHANGELOG.md` on the next
release.

## When to add a changeset

Add a changeset whenever a PR makes a user-facing change:
- new feature, behavior change, bug fix, breaking change, schema change, command
  contract change, adapter change

Skip changesets for: docs-only edits, internal refactors with no behavior change,
CI/build-only edits.

## How to add a changeset

```bash
pnpm changeset
```

Pick a bump type (patch / minor / major) and write a short summary. The CLI writes
a `<random-name>.md` file here that the release workflow consumes.

## How releases work

On merge to `main`, the release workflow opens / updates a "Release" PR that
consumes pending changesets, bumps `package.json` version, and updates
`CHANGELOG.md`. Merging that PR triggers `npm publish --provenance` and a tagged
GitHub Release. (Release workflow lands in plan 03.)

## Config

See `.changeset/config.json`. The defaults match the recommended 2026 setup for a
single-package public repo with provenance-signed publishes.
