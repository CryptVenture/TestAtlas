// scripts/lib/list-command-files.js
//
// Sorted enumeration of .testatlas/commands/*.md plus the canonical
// LIFECYCLE_FILES constant in PRD §40 ordering.

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
 * List `.md` files directly under `.testatlas/commands/` in the given cwd.
 * Returns a sorted array of absolute paths. Returns `[]` if the directory
 * does not exist (Wave-0 tolerance: Plan 03-01 lands before command files).
 *
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listCommandFiles({ cwd = process.cwd() } = {}) {
  const dir = path.join(cwd, '.testatlas', 'commands');
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
