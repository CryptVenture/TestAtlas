# Updating TestAtlas

TestAtlas applies updates **atomically** with rollback-on-failure. The two-tree invariant is sacred: `.testatlas/` (the suite program) is replaced; `_testatlas/` (your workspace state) is preserved across updates and only mutated by explicit, idempotent migration `up()` functions.

## When does TestAtlas check for updates?

By default, every install/init/update probes the GitHub Releases API at most once per 24 hours (TTL configurable). The cache lives at `.testatlas/.update-cache.json` so reruns inside the TTL window are zero-network.

If a newer version is found, the agent surfaces an `/atlas:update` invitation; nothing is auto-applied (per UPDATE-02).

## Disabling the update check

Three escape hatches:

| Mechanism | When to use |
|-----------|-------------|
| `--no-update-check` flag | One-off; passed to `init`, `update`, etc. |
| `disableUpdateCheck: true` in `.testatlas/config.json` | Project-level permanent opt-out. |
| Offline / no network | The check is offline-tolerant: a fetch failure is logged and treated as "no update available" — never blocks the operation. |

The cache also tolerates GitHub API rate-limit responses (`X-RateLimit-Remaining: 0`) by treating them as transient and falling back to "no update available."

## Running an update

```sh
node update.js               # uses cwd as target
node update.js --target /path/to/project
```

(or via the bin: `npx @webventures/testatlas update`)

Flags:

| Flag | Effect |
|------|--------|
| `--target <dir>` | Update an installation rooted at `<dir>`. |
| `--dry-run` | Print the plan (which files would change, which migrations would run) without writing. |
| `--force-reinstall` | Re-apply current version — useful if files were tampered with. |
| `--latest-version <v>` | Override the resolved latest version (pin against a specific tag). |
| `--no-update-check` | Skip the version probe; useful when you already know the version. |
| `--verify-signature` | Require cosign signature verification on the downloaded tarball. |

## Atomic update flow

1. **Acquire lockfile** — `_testatlas/.lock` blocks concurrent updates and in-flight test runs (PID + age dual-stale detection).
2. **Stage** — download new suite tarball, extract into `.testatlas.staging-<ts>/`.
3. **Migrate** — discover migration files (`.testatlas/migrations/v<N>-to-v<N+1>.js`), order by source/target version, compose long jumps (e.g., v1 → v5 runs v1→v2 → v2→v3 → v3→v4 → v4→v5). Migrations are idempotent and forward-only.
4. **Swap** — rename `.testatlas/` → `.testatlas.backup-<ts>/`, then rename `.testatlas.staging-<ts>/` → `.testatlas/`. Atomic on POSIX; Windows uses retry-with-backoff for transient EBUSY/EPERM.
5. **Prune** — keep the 3 most recent backups; remove older ones.
6. **Release lockfile**.

If any step fails, rollback restores `.testatlas/` from the backup and leaves the workspace untouched. SIGINT mid-update is also handled.

## Backup retention

The 3 most recent `.testatlas.backup-<timestamp>/` directories are kept. To retain more, manually copy the backup before the next update.

To restore a backup manually:

```sh
rm -rf .testatlas
mv .testatlas.backup-2026-05-04T01-23-45Z .testatlas
```

## Migration framework

Migrations live in `.testatlas/migrations/v<N>-to-v<N+1>.js` and export an `up({ workspaceDir, suiteDir })` async function. Contract:

- **Forward-only** — no `down()`. Roll back by restoring a backup.
- **Idempotent** — re-running must converge to the same end state.
- **N→N+1 only** — each file migrates exactly one version step. Long jumps are composed automatically.
- **Touches `_testatlas/` only via the migration runner** — the migration is the only legitimate writer to the workspace tree during update.

v0.1.0 ships zero migrations — the v1 schema is the baseline. The first real migration arrives at v0.2.0+.

## Workspace lockfile

`_testatlas/.lock` is held during long-running operations (test runs, updates). The lock contains the holder's PID and a timestamp; stale locks (PID gone OR older than 1h) are auto-released. If you see "lock held" errors:

```sh
cat _testatlas/.lock           # see who's holding it
ps -p <PID> 2>/dev/null         # is that process alive?
rm _testatlas/.lock             # force-release if stale
```

## Version pinning

Some teams want to lock to a specific suite version (audit / compliance / paced rollout):

```json
// .testatlas/config.json
{
  "pinnedVersion": "0.1.0",
  "pinnedSince": "2026-05-04T00:00:00Z",
  "pinAlertThresholdDays": 90
}
```

Behavior:

- Update check still runs and reports newer versions.
- Updates **are not auto-applied** while pinned (matches default — but pin is explicit).
- After `pinnedSince + pinAlertThresholdDays` (default 90 days), agents surface a stale-pin warning.
- Setting the pin is intentional; clearing it is a one-line edit.

Future (v2): `bin/testatlas.js pin <version>` will set both `pinnedVersion` and `pinnedSince` atomically.

## Signature verification (opt-in)

Pass `--verify-signature` to require cosign verification of the npm-published tarball's sigstore bundle:

```sh
node update.js --verify-signature
```

Cosign must be installed locally. See [docs/SIGNING.md](./SIGNING.md) for setup.

Without the flag, SHA-256 checksum verification (against the GitHub Release's published checksum) still runs by default.

## What's preserved across updates

| Tree | Replaced | Preserved | Notes |
|------|----------|-----------|-------|
| `.testatlas/` | YES (atomic swap) | NO | Suite program — replaced wholesale. |
| `.testatlas/config.json` | NO | YES | User config preserved across updates. |
| `.testatlas/.install-manifest.json` | Rewritten | Hash data only | Replaced with new manifest reflecting new file set. |
| `_testatlas/` | NO | YES | Workspace state — only migrations may touch it. |

## Troubleshooting

### "Lock held by PID <N> — refusing to update"

Another `update.js`/`init.js`/test runner is in flight. Wait, or if the PID is dead: `rm _testatlas/.lock`.

### "Migration v<N>-to-v<N+1> failed"

Update aborts BEFORE swap. `.testatlas/` is unchanged. Inspect the migration error; file an issue including the migration log.

### "Update check failed: rate-limit"

GitHub's unauthenticated API rate limit is 60 req/h per IP. The cache TTL (default 24h) keeps you well under this. If you hit it, wait an hour or set `disableUpdateCheck: true`.

### "Signature verification failed"

The downloaded tarball's sigstore bundle didn't verify. Likely transient — retry. If persistent, that's a serious supply-chain signal: stop, investigate, file an issue.

## What's Next

- **`/atlas:validate-workspace`** — confirm schemas + manifest still validate after the swap
- **[CHANGELOG](../CHANGELOG.md)** — see what changed in this release
- **[Install](./INSTALL.md)** — fresh-install reference if rolling back
- **[LTS](./LTS.md)** — long-term support window policy
