// test/fixtures/migrations-fixture/v1-to-v2.js
//
// Test fixture migration. Renames `<workspaceDir>/scratch/` → `<workspaceDir>/sandbox/`.
// Idempotent: safe to call repeatedly.
//
// Used by:
//   - test/update/migrate-discovery.test.js
//   - test/update/migrate-idempotent.test.js
//   - test/update/migrate-longjump.test.js
//   - test/update/update-atomic.test.js (for end-to-end migration during update)

import { rename, stat } from 'node:fs/promises';
import path from 'node:path';

export const fromSchema = 1;
export const toSchema = 2;
export const description = 'Renames _testatlas/scratch/ to _testatlas/sandbox/';

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

/**
 * @param {string} workspaceDir   Absolute path to <target>/_testatlas/.
 * @param {{ fromVersion: string, toVersion: string }} _ctx
 */
export async function up(workspaceDir, _ctx) {
  const oldPath = path.join(workspaceDir, 'scratch');
  const newPath = path.join(workspaceDir, 'sandbox');
  if ((await exists(oldPath)) && !(await exists(newPath))) {
    await rename(oldPath, newPath);
  }
}
