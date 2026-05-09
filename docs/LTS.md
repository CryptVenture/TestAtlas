# LTS Strategy & Support Window

TestAtlas follows a clear, predictable Long-Term Support policy so adopters can plan upgrades and security teams can audit dependency surface.

## Support Window

**The current major version + the previous major version are supported.**

| Version line | Status | Receives |
|--------------|--------|----------|
| Current major (`2.x`) | Active | New features, bug fixes, security patches, schema migrations |
| Previous major (`1.x`) | Maintenance | Security patches and critical bug fixes only — no new features |
| Older majors (`0.x`) | End-of-life | No updates of any kind. Open issues will be closed with an upgrade pointer. |

Each new major release pushes the support window forward by one. When `2.x` ships, `1.x` enters maintenance and `0.x` becomes EOL.

## Cadence

- **Patch releases** (`x.y.Z`): as needed; typically within a few days of a confirmed bug.
- **Minor releases** (`x.Y.0`): every 4–8 weeks during active development.
- **Major releases** (`X.0.0`): targeted at ~2 per year. Driven by accumulated breaking changes (schema redesigns, command-contract revisions, adapter contract evolutions).

This cadence is a target, not a contract. We will not ship a major just to maintain pacing — every major must justify the breaking change.

## What constitutes a breaking change?

A change requires a major bump if it:

- Changes a JSON Schema in a non-backward-compatible way (renames, removes fields, tightens validators) without a migration.
- Removes or renames a public command (`/atlas:*`).
- Changes the `_testatlas/` workspace directory structure such that an old workspace cannot be read by the new suite without migration.
- Drops support for a Node version that's still in the maintenance window.
- Removes or breaks an adapter contract.

Schema/command changes accompanied by a migration are NOT breaking — they're a minor bump and an entry in `CHANGELOG.md` under "Schema migration."

## Security backports

Security fixes are backported to all supported version lines. The patch lands first on the current major, then on the previous major. Both releases happen the same day where possible.

For coordinated disclosure timelines see [SECURITY.md](../SECURITY.md).

## Migration framework guarantees

Across the support window:

- **Forward-only migrations.** Each migration is N → N+1 and idempotent. Long jumps (v1 → v5) compose automatically through the chain.
- **Long-jump CI gate.** Every release runs `v1 → current` migrations against a representative workspace fixture and validates the result. If the chain breaks, the release blocks.
- **Migration files never deleted.** `.testatlas/migrations/v<N>-to-v<N+1>.js` files persist in the repo forever — they are the lineage. Removing one would break long-jump composition.

## Node.js version policy

The `engines.node` floor is the LTS floor. We track:

- Drop a Node major from `engines.node` only on a TestAtlas major bump.
- Add new Node majors to CI matrix as soon as they enter Active status.
- Currently supported: Node 20.11+ (matches `package.json`).
- CI matrix: Node 20.x, 22.x, 24.x.

## Pinning

If you need to lock to a specific version (audit, compliance, paced rollout):

```json
// .testatlas/config.json
{
  "pinnedVersion": "1.4.2",
  "pinnedSince": "2026-05-04T00:00:00Z",
  "pinAlertThresholdDays": 90
}
```

Pinned installs:

- Still receive update notifications (informational).
- Are NOT auto-updated.
- Surface a stale-pin warning after `pinnedSince + pinAlertThresholdDays`.

The default 90-day threshold is calibrated against typical security-fix windows. Lower it if your compliance posture requires faster review.

## Deprecation policy

Before removing a feature in a major release:

1. **Mark deprecated** in a minor release. Adds a runtime warning (one-shot per session).
2. **Document migration path** in `CHANGELOG.md` and the relevant doc file.
3. **Hold for at least one minor release** before removal.
4. **Remove** in the next major.

Adapters get longer deprecation runways (2 minors minimum) because adapter authors have less control over their consumers' upgrade pace.

## Release lineage

Tagged releases are immutable. Once `v1.2.3` is published:

- The git tag is signed and never moved.
- The npm version is never unpublished (unless a security incident requires registry takedown — extremely rare; coordinated with npm Security).
- The GitHub Release is never deleted (assets may be re-attached if a sidecar needs regeneration).

If a release ships with a critical bug, the fix is `v1.2.4`, not a re-issue of `v1.2.3`.

## Rolling forward

To check what version you're on and what's available:

```sh
npx @webventures/testatlas update --dry-run
```

This prints the installed version, the latest available, and what migrations would run. No changes are made.

To pin to a specific version line and stay there:

```json
// .testatlas/config.json
{
  "pinnedVersion": "1"   // matches semver `^1`
}
```

This accepts any `1.x.y` release. Drop the pin to ride the latest.

## Questions?

- Schema changes mid-version: see [docs/UPDATE.md](./UPDATE.md#migration-framework).
- Adapter contract changes: see the contract docs in `.testatlas/adapters/`.
- Security backport requests: see [SECURITY.md](../SECURITY.md).
