# Uninstalling TestAtlas

Uninstall is **manifest-driven**: every file installed by `init` is recorded in `.testatlas/.install-manifest.json` with its content hash. Uninstall removes exactly those files and nothing else — your hand-written content is never deleted by accident.

## Quick run

```sh
node uninstall.js              # uses cwd as target
node uninstall.js --target /path/to/project
```

(or via the bin: `npx testatlas uninstall`)

By default this:

1. Reads `.testatlas/.install-manifest.json`.
2. Removes every tracked `.testatlas/` file whose content hash still matches the manifest.
3. Removes the suite directory if empty after pruning.
4. **Preserves `_testatlas/`** — your workspace state is sacred. Use `--purge` to remove it explicitly.

## Behavior matrix

| Flag | `.testatlas/` | `_testatlas/` | Untracked / modified files |
|------|---------------|---------------|----------------------------|
| (default) | Removed (tracked + hash-matching) | Preserved | Refused unless `--force-untracked`; lists them |
| `--purge` | Removed (tracked + hash-matching) | **Removed** | Refused unless `--force-untracked` |
| `--force-untracked` | Removed (incl. untracked + modified) | Preserved (unless `--purge`) | Removed |
| `--purge --force-untracked` | Removed | **Removed** | Removed |
| `--dry-run` | Lists what would be removed | (per `--purge`) | (per `--force-untracked`) |

## Flags

| Flag | Effect |
|------|--------|
| `--target <dir>` | Uninstall from `<dir>` instead of cwd. |
| `--purge` | Also remove `_testatlas/` workspace tree. **Destroys your workspace state — there is no recovery.** |
| `--force-untracked` | Allow removal even when the manifest is missing/invalid OR when `.testatlas/` contains files with hash mismatches. |
| `--dry-run` | Print the removal plan without changing anything. |

## What "tracked" means

The manifest is the source of truth. Each entry records:

- POSIX-relative path inside `.testatlas/`.
- SHA-256 content hash at install time.
- Source adapter (so multi-adapter installs uninstall in the right order).

At uninstall:

- A file matching its manifest hash → removed silently.
- A file with a hash mismatch (you edited it) → flagged; uninstall refuses by default.
- A file with no manifest entry → flagged as untracked; refused by default.
- A manifest entry pointing to a file that's already gone → silently skipped.

To force removal regardless: `--force-untracked`. Use sparingly.

## `--purge` semantics

`_testatlas/` contains durable workspace state — your domain map, flows, evidence, issues, reports. Treat it like source code: irrecoverable if deleted.

`--purge` removes:

- `_testatlas/` and everything inside it.
- The lockfile `_testatlas/.lock` (if present).
- The workspace manifest `_testatlas/11_workspace_manifest.json`.

**Uninstall does NOT remove:**

- Your repo's `.git/` directory.
- Files you put outside `.testatlas/` and `_testatlas/`.
- Adapter command files that the manifest didn't track (e.g., custom `.claude/commands/foo.md` you authored — those are yours).

## When the manifest is missing or invalid

If `.testatlas/.install-manifest.json` is corrupt or absent:

```
ERROR: Manifest missing or invalid. Refusing to uninstall.
       Use --force-untracked to override (will require manual cleanup of any untracked content).
```

`--force-untracked` falls back to a defensive remove of `.testatlas/` (the directory tree TestAtlas created), but cannot precisely target only the files it installed — there's no record of what those were.

## Cross-platform path handling

The manifest stores POSIX paths even on Windows. Uninstall reads each entry and joins via `path.join(target, ...entry.path.split('/'))`. Backslashes never appear in the manifest; if you see one, it's a bug.

## Restoring after uninstall

You can't undo `--purge`. For non-purge uninstall, just re-run install:

```sh
npx testatlas init
```

The new install creates a fresh `_testatlas/` skeleton — but if you preserved your workspace state via the default uninstall flow, all of your domain/flow/evidence/issue files are still there and reattach automatically.

## Common scenarios

### "I want to start completely fresh"

```sh
node uninstall.js --purge
rm -rf .testatlas .testatlas.backup-*
npx testatlas init
```

### "I uninstalled then realized I wanted my workspace"

If you didn't pass `--purge`, your workspace is fine — just re-run install.

### "Uninstall says files are modified"

Either:

- Revert your edits (the install was idempotent, so the originals match the manifest hashes).
- Or pass `--force-untracked` to ignore the mismatch and remove anyway.

### "I want to migrate to a different repo"

```sh
# Old repo
node uninstall.js          # workspace preserved
mv _testatlas /tmp/atlas-state

# New repo
npx testatlas init
mv /tmp/atlas-state/* _testatlas/
```
