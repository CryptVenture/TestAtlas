// test/_helpers.js
//
// Reusable fixture helpers for Phase 2+ tests. The pattern mirrors the inline
// `makeFixture` from test/config.test.js, but generalized: it copies the
// entire `.testatlas/` suite tree (including templates/canonical, schemas,
// vocabulary.json, bootstrap.md, default.config.json, config.schema.json) into
// a temp directory, optionally writes an override config, and returns a tuple
// of `{cwd, cleanup}` so callers can pass `cleanup` to `t.after`.
//
// Used by test/init-workspace.test.js (Plan 02-04) and any later plan that
// needs a self-contained TestAtlas-installed temp repo.

import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Create a temp dir resembling a fresh consumer repo with TestAtlas suite installed.
 *
 * @param {{ withSuite?: boolean, override?: object|string, prefix?: string }} [opts]
 * @returns {Promise<{ cwd: string, cleanup: () => Promise<void> }>}
 */
export async function makeWorkspaceFixture({ withSuite = true, override, prefix = 'ws-' } = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), prefix));
  if (withSuite) {
    await cp(path.join(REPO_ROOT, '.testatlas'), path.join(cwd, '.testatlas'), {
      recursive: true,
    });
  }
  if (override !== undefined) {
    const text = typeof override === 'string' ? override : JSON.stringify(override, null, 2);
    await writeFile(path.join(cwd, 'testatlas.config.json'), text, 'utf8');
  }
  return {
    cwd,
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  };
}

/**
 * Convenience: clean up an arbitrary directory (best-effort).
 *
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}
