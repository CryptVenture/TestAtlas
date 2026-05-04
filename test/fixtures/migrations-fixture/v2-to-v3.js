// test/fixtures/migrations-fixture/v2-to-v3.js
//
// Test fixture migration. Writes `<workspaceDir>/.schema-marker` with body "3"
// if the file is absent. Idempotent: re-running with marker present is a no-op.

import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const fromSchema = 2;
export const toSchema = 3;
export const description = 'Adds .schema-marker file at workspace root';

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
  const marker = path.join(workspaceDir, '.schema-marker');
  if (!(await exists(marker))) {
    await writeFile(marker, '3', 'utf8');
  }
}
