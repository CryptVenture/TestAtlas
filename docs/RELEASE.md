# Release Process

How TestAtlas releases are cut, published, signed, and tracked. This is the maintainer-facing companion to [docs/SIGNING.md](./SIGNING.md).

## Overview

TestAtlas uses [`@changesets/cli`](https://github.com/changesets/changesets) for version + CHANGELOG management and GitHub Actions for the publish pipeline. The release workflow is `.github/workflows/release.yml`.

There are two pipelines:

| Pipeline | Trigger | Effect |
|----------|---------|--------|
| Release PR | Push to `main` with pending changesets | Opens/updates a "Release PR" that bumps `package.json` + writes `CHANGELOG.md` entries |
| Publish | Merge of Release PR (or manual `release:published`) | Runs `pnpm changeset publish`, npm publishes via OIDC, syncs `install.sh`, attaches GitHub Release sidecars |

Plus a third **dry-run** path (`workflow_dispatch` with `dry-run: true`) for safe pre-publish validation.

## Authoring a changeset

For any user-visible change, run:

```sh
pnpm changeset
```

Pick:

- The change type: `patch` / `minor` / `major`.
- A summary that will land in `CHANGELOG.md`.

This writes `.changeset/<random-name>.md`. Commit it with your PR. Multiple changesets accumulate; the Release PR consumes them all.

### Schema or command-contract changes

If your PR changes:

- A `*.schema.json` `$id` version,
- A public command spec (input/output contract),
- The two-tree invariant or workspace-tree shape,

then your changeset MUST include a "Schema migration: v<N>→v<N+1>" or "Command contract: …" line in the summary. CI gates this via the changeset PR template.

## Trusted Publisher (one-time setup)

Before the first real publish, configure npm Trusted Publishing so the workflow can publish without a long-lived `NPM_TOKEN`:

1. Go to https://www.npmjs.com/package/testatlas/access (after the first publish exists; for the very first publish, fall back to a one-shot `NPM_TOKEN` secret).
2. Trusted Publishers → Add → GitHub Actions.
3. Repository: `CryptVenture/TestAtlas`.
4. Workflow: `release.yml`.
5. Environment: leave blank (we don't gate on a GHA environment).
6. Save.

The workflow already has `id-token: write` permission. After Trusted Publisher is configured, `NPM_TOKEN` becomes irrelevant; npm CLI ≥ 11.5.1 publishes via the short-lived OIDC token.

For the very first publish (chicken-and-egg), generate a granular `NPM_TOKEN` (publish-only, package-scoped to `testatlas`), add it as a GitHub repo secret, run the publish, then configure Trusted Publishing for subsequent releases and revoke the token.

## First publish — Bootstrap NPM_TOKEN (v1.0.0 only)

v1.0.0 is the **first publish**. Trusted Publishing (OIDC) requires the npm package to exist before a trust relationship can be declared, so the very first publish needs a different bootstrap path. This section is the explicit one-shot procedure.

1. **Verify the npm name is available.**

   ```sh
   npm view testatlas
   # Expected: 404 not found. If it returns metadata for a different package,
   # escalate before tagging.
   ```

2. **Generate a one-shot Granular Access Token.**

   - Sign in at https://www.npmjs.com → Account → Access Tokens → "Generate New Token" → Granular.
   - **Packages:** scope to `testatlas` only (not `*`).
   - **Permissions:** Read and write (the "publish" capability).
   - **Expiration:** 7 days. (Short window so a leak window is small.)
   - Copy the token value (you cannot view it again).

3. **Install as a repo secret.**

   ```sh
   gh secret set NPM_TOKEN
   # Paste the token value when prompted.
   ```

4. **Tag and dispatch.**

   ```sh
   git tag -a v1.0.0 -m "TestAtlas v1.0.0 GA"
   git push origin v1.0.0
   gh workflow run release.yml --ref v1.0.0
   gh run watch
   ```

   The `release.yml` pipeline runs `pnpm changeset publish`. The workflow has `id-token: write` and prefers OIDC; if Trusted Publishing isn't configured yet (it can't be, see step 1), npm CLI falls back to the `NPM_TOKEN` env var.

5. **Verify the publish.**

   ```sh
   npm view testatlas version            # → 1.0.0
   npm view testatlas dist.shasum
   npm audit signatures                  # provenance + signature verify
   ```

6. **Configure Trusted Publishing (post-first-publish).**

   - Visit https://www.npmjs.com/package/testatlas/access.
   - Trusted Publishers → Add → GitHub Actions.
   - Repository: `CryptVenture/TestAtlas`.
   - Workflow filename: `release.yml`.
   - Save.

7. **Revoke the bootstrap NPM_TOKEN.**

   ```sh
   # On npmjs.com → Account → Access Tokens → revoke the 7-day token.
   gh secret delete NPM_TOKEN
   ```

8. **v1.0.1+ uses OIDC only.** No `NPM_TOKEN` required for any subsequent publish.

The same chicken-and-egg note applies if the npm package is ever transferred to a new org — Trusted Publishing trust must be re-declared after transfer, and a one-shot token is the bridge.

## Dry-run validation

Before merging a Release PR, validate the full pipeline:

```sh
gh workflow run release.yml -f dry-run=true
```

(or trigger via the GitHub UI: Actions → Release → Run workflow → set `dry-run: true`).

Steps that run:

- `pnpm changeset publish --dry-run` — verifies the publish would proceed.
- `npm pack --dry-run --json` — verifies the file set.

Steps that DO NOT run:

- The actual publish.
- The post-publish `install.sh` sed.
- The GitHub Release create.

Always green-on-dry-run before approving a Release PR.

## Real publish flow

When the Release PR is merged into `main`:

1. **changesets/action** detects the version bump in `package.json` and runs `pnpm changeset publish`.
2. **npm publish** runs with provenance (OIDC bound to `release.yml@refs/tags/vX.Y.Z`). The package lands on the registry with an attestation.
3. **Sync install.sh** step runs:
   - Reads `package.json` `version`.
   - Downloads the just-published tarball from `https://registry.npmjs.org/testatlas/-/testatlas-<VERSION>.tgz`.
   - Computes SHA-256.
   - `sed`s `VERSION="..."` and `TARBALL_SHA256="..."` lines in `install.sh`.
   - Commits the bumped `install.sh` back to `main` as `chore(release): sync install.sh to v<VERSION>`.
4. **Compute SHA-256 sidecar** writes `testatlas-<VERSION>.tgz.sha256`.
5. **Fetch sigstore bundle** pulls the npm-attestation pointer and downloads `testatlas-<VERSION>.tgz.sigstore.json`.
6. **GitHub Release create** attaches the tarball + .sha256 + .sigstore.json as release assets, with the CHANGELOG entry as the release notes body.

End state:

- npm registry has `testatlas@<VERSION>` with provenance.
- GitHub Release `v<VERSION>` exists with all three sidecars.
- `main` branch has the bumped `install.sh` so `curl … | sh` flows hit the new version.

## install.sh contract

`install.sh` has two `sed`-targeted lines that the release workflow rewrites every release:

```sh
VERSION="0.1.0"
TARBALL_SHA256="abc123..."
```

These lines must:

- Be at the START of `install.sh` (post-shebang, pre-functions).
- Match the regex `^VERSION=.*$` and `^TARBALL_SHA256=.*$` exactly.

Hand-edit only when bootstrapping; thereafter the workflow is the only writer.

## Rollback procedure

If a release ships a critical bug or security flaw:

### Option A — Forward fix (preferred)

1. Land the fix on `main`.
2. Run `pnpm changeset` declaring a `patch`.
3. Land the Release PR; the next version (e.g., `1.2.4`) supersedes the bad one.
4. Document in `CHANGELOG.md`: "Fixed: critical bug in 1.2.3; users SHOULD upgrade."

### Option B — Deprecate the version

```sh
npm deprecate testatlas@1.2.3 "Critical bug; use 1.2.4 or later."
```

This does NOT remove the version (preserving lineage) but flags it on install.

### Option C — Unpublish (last resort)

Only for security incidents (leaked secret, malicious code):

1. Coordinate with npm Security — they handle takedown.
2. Same coordinated takedown for the GitHub Release (delete or replace assets).
3. Issue a security advisory via GitHub Security Advisories.
4. Email all maintainers and known adopters.

**Avoid unpublish.** It breaks `package-lock.json` files for adopters. Forward-fix or deprecate instead.

## Release artifacts (per version)

| Artifact | Where it lives | How it's verified |
|----------|----------------|--------------------|
| `testatlas-<VERSION>.tgz` | npm registry + GitHub Release | `sha256sum -c testatlas-<VERSION>.tgz.sha256` |
| `testatlas-<VERSION>.tgz.sha256` | GitHub Release asset | Plain text; one line |
| `testatlas-<VERSION>.tgz.sigstore.json` | GitHub Release asset | `cosign verify-blob-attestation --bundle ...` |
| Provenance attestation | npm registry (auto) | `npm audit signatures` |
| `install.sh` (bumped) | `main` branch | `sha256sum install.sh` against `<VERSION>.tgz.sha256` |
| Git tag `vX.Y.Z` | This repo | Signed; matches changesets-published version |

## CI gates that block release

Before a Release PR can merge:

- `ci.yml` matrix green on Linux/macOS/Windows × Node 20/22/24.
- Token-budget gate green (bootstrap ≤ 3000 words, command ≤ 1500 words).
- Schema/template parity gate green.
- Adapter parity gate green.
- Long-jump migration test green (v1 → current).
- `npm pack --dry-run` succeeds (release.yml dry-run path).
- `shellcheck install.sh` clean.

Any red gate blocks the merge; do not bypass.

## Maintainer responsibilities

- **Quarterly:** review pinned-version warnings, drop EOL major from CI matrix per LTS policy.
- **On every release:** verify `npm audit signatures` against the published version from a clean machine.
- **On every major:** update [docs/LTS.md](./LTS.md) support matrix and the CI matrix.

## Useful commands

```sh
# Status of pending changesets
pnpm changeset status

# What would be published (no actual publish)
pnpm changeset publish --dry-run

# What npm would pack
npm pack --dry-run --json | jq

# Trigger a workflow dry-run from the CLI
gh workflow run release.yml -f dry-run=true

# Watch a running workflow
gh run watch
```
