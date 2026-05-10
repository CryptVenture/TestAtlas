// scripts/lib/is-main.js
//
// Cross-platform "is this script being run directly?" check.
//
// The naive variants are:
//   - `import.meta.url === \`file://${process.argv[1]}\``
//     Broken on Windows: `import.meta.url` produces `file:///D:/...` with
//     forward slashes, while `process.argv[1]` is `D:\...` with backslashes.
//   - `path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))`
//     Broken on macOS: `mkdtemp` and friends return `/var/folders/...` paths
//     that are symlinks to `/private/var/folders/...`. `import.meta.url` resolves
//     through the symlink (real path) but `process.argv[1]` doesn't, so the two
//     never match for symlinked launch dirs.
//
// `isMainModule(import.meta.url)` resolves BOTH sides through `realpathSync`
// to canonical paths on the actual filesystem, then compares as strings.
// Works on Linux, macOS (symlinks), and Windows (path separators).
//
// Usage:
//   import { isMainModule } from './lib/is-main.js';
//   if (isMainModule(import.meta.url)) {
//     await cliMain();
//   }

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} metaUrl  Pass `import.meta.url` from the calling module.
 * @returns {boolean}       True when the module was invoked as `node <this-file>`.
 */
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
  } catch {
    // realpathSync throws when the file doesn't exist (shouldn't happen in
    // the CLI-guard case — both sides reference live files — but be defensive
    // so a missing argv[1] never blows up an exported library use).
    return false;
  }
}
