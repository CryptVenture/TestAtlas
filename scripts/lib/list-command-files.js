// scripts/lib/list-command-files.js
//
// Sorted enumeration of `.testatlas/commands/*.md` plus the canonical
// LIFECYCLE_FILES constant in PRD §40 ordering.
//
// V2 extension (Phase 14 Wave 5): when called with `{ includeCategorized: true }`,
// also enumerates categorized command files at
// `.testatlas/commands/<category>/<name>.md` for the V2 categories
// (core, explore, test, council, brain, report, maintain). The default
// (`includeCategorized: false`) preserves the V1 contract: callers like
// `mcp-server.js`, `check-command-budgets.js`, and the V1 frontier tests see
// only the flat top-level commands. V2 adapter generation and parity opt in.

import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * The 5 lifecycle files every command must update after execution (PRD §40).
 * Order: status -> artifact-index -> command-log -> manifest -> run-log.
 */
export const LIFECYCLE_FILES = [
  '03_execution_status.md',
  '09_artifact_index.md',
  '10_command_log.md',
  '11_workspace_manifest.json',
  'history/run_log.md',
];

/**
 * V2 command category subdirectories under `.testatlas/commands/`. The set is
 * fixed by the V2 PRD §7.* taxonomy. Empty subdirs (e.g. test/, brain/,
 * report/, maintain/ at Wave 5 ship time) are tolerated — they contribute
 * zero entries and do not error.
 */
export const V2_COMMAND_CATEGORIES = Object.freeze([
  'core',
  'explore',
  'test',
  'council',
  'brain',
  'report',
  'maintain',
]);

/**
 * List `.md` files directly under `.testatlas/commands/` in the given cwd.
 * Returns a sorted array of absolute paths. Returns `[]` if the directory
 * does not exist (Wave-0 tolerance: Plan 03-01 lands before command files).
 *
 * V2 extension: when `includeCategorized` is true, also walks the category
 * subdirs (V2_COMMAND_CATEGORIES) and appends their `.md` files. Result is
 * sorted globally so the order is stable across V1-only and V2 callers
 * (the merged list is `[...flat, ...categorized]` each sorted internally,
 * with flat first to keep V1 ordering byte-stable for any consumer that
 * still slices the head of the array).
 *
 * @param {{ cwd?: string, includeCategorized?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listCommandFiles({ cwd = process.cwd(), includeCategorized = false } = {}) {
  const dir = path.join(cwd, '.testatlas', 'commands');
  const flat = await listDirMdFiles(dir);
  if (!includeCategorized) return flat;

  const categorized = [];
  for (const cat of V2_COMMAND_CATEGORIES) {
    const subdir = path.join(dir, cat);
    const entries = await listDirMdFiles(subdir);
    categorized.push(...entries);
  }
  return [...flat, ...categorized.sort()];
}

/**
 * List categorized command files only — flat top-level files are excluded.
 * Returns an array of `{ absPath, basename, category }` records sorted by
 * `(category, basename)`. Used by the V2 adapter generator to compute nested
 * output paths (e.g. `.claude/commands/council/atlas-council.md`).
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<Array<{ absPath: string, basename: string, category: string }>>}
 */
export async function listCategorizedCommandFiles({ cwd = process.cwd() } = {}) {
  const root = path.join(cwd, '.testatlas', 'commands');
  /** @type {Array<{ absPath: string, basename: string, category: string }>} */
  const out = [];
  for (const cat of V2_COMMAND_CATEGORIES) {
    const subdir = path.join(root, cat);
    const files = await listDirMdFiles(subdir);
    for (const absPath of files) {
      out.push({
        absPath,
        basename: path.basename(absPath, '.md'),
        category: cat,
      });
    }
  }
  out.sort((a, b) =>
    a.category === b.category
      ? a.basename.localeCompare(b.basename)
      : a.category.localeCompare(b.category),
  );
  return out;
}

/**
 * Internal helper: list `.md` files (excluding README.md) directly under `dir`.
 * Returns absolute paths sorted lexically. Tolerates ENOENT by returning [].
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listDirMdFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => path.join(dir, e.name))
    .sort();
}
