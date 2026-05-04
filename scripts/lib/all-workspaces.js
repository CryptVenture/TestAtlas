// scripts/lib/all-workspaces.js
//
// Plan 08-03 Task 1. Workspace discovery helper for the
// `validate-workspace.js --all-workspaces <root>` code path.
//
// Walks `rootPath` recursively and returns absolute paths of all `_testatlas/`
// directories. Pruned: node_modules, .git, dist, build, .next, .expo,
// coverage, and `.testatlas` (the SUITE tree, not a workspace tree).
//
// Determinism: directory entries are sorted lexically before recursion so the
// returned array is stable across machines/filesystems.

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Directory names whose subtrees are NEVER searched.
 *
 * `.testatlas` is excluded because it is the SUITE tree (instructions,
 * schemas, .install-manifest.json) — it has the same prefix-character `.`
 * as `_testatlas` only by visual coincidence; structurally they are
 * distinct trees per the Phase 2 two-tree invariant.
 */
const PRUNE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.expo',
  'coverage',
  '.testatlas',
]);

const WORKSPACE_DIRNAME = '_testatlas';

/**
 * Discover all `_testatlas/` directories under `rootPath`.
 *
 * Returns absolute paths in lexical sort order (stable across runs). Does not
 * descend into `_testatlas/` itself — workspace internals are not workspaces.
 * Does not descend into the prune list.
 *
 * @param {string} rootPath relative or absolute
 * @returns {Promise<string[]>} sorted absolute paths
 */
export async function discoverWorkspaces(rootPath) {
  const root = resolve(rootPath);
  const found = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Unreadable dirs (perms, ENOENT) are skipped silently — the helper is
      // best-effort discovery, not a filesystem-integrity check.
      return;
    }
    // Stable lexical sort so the returned list is deterministic.
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'variant' }));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (PRUNE.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.name === WORKSPACE_DIRNAME) {
        found.push(full);
        // Do NOT descend — workspace internals are not nested workspaces.
        continue;
      }
      await walk(full);
    }
  }

  await walk(root);
  return found;
}
