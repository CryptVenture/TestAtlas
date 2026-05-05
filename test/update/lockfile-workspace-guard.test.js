// test/update/lockfile-workspace-guard.test.js
//
// Plan 12-02 — ISSUE-018 regression coverage.
//
// Three assertions:
//   A. workspace-guard contract is NOT bypassed: zero callsites of
//      `assertNotUpdate('update')` exist anywhere under scripts/lib/**.
//      Calling `assertNotUpdate('update')` would throw TESTATLAS_TWO_TREE_VIOLATION
//      on every legitimate update flow — see RESEARCH.md Open Q §1 Option B.
//   B. acquireLock succeeds against a fresh target where _testatlas/ does NOT
//      pre-exist (mkdir-parent guards the ENOENT failure path).
//   C. lockfile.js documents the two-tree invariant exception so the next
//      reader understands why the lockfile legitimately writes to _testatlas/.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acquireLock, releaseLock } from '../../scripts/lib/lockfile.js';

async function walkJs(dir) {
  const out = [];
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkJs(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test("workspace-guard not bypassed: no assertNotUpdate('update') in scripts/lib", async () => {
  const root = path.resolve('scripts/lib');
  const files = await walkJs(root);
  const hits = [];
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    if (src.includes("assertNotUpdate('update')")) hits.push(f);
    if (src.includes('assertNotUpdate("update")')) hits.push(f);
  }
  assert.deepEqual(
    hits,
    [],
    `assertNotUpdate('update') found in: ${hits.join(', ')} — see RESEARCH.md Open Q §1`,
  );
});

test('acquireLock succeeds against target without pre-existing _testatlas/', async (t) => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'testatlas-lock-mkdir-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  // Deliberately do NOT pre-create <tmp>/_testatlas/. acquireLock must mkdir
  // its parent before writing the lock file.
  await acquireLock(tmp, { pid: process.pid, holdReason: 'update' });
  const s = await stat(path.join(tmp, '_testatlas', '.lock'));
  assert.ok(s.isFile(), 'lock file must exist on disk after acquireLock');
  await releaseLock(tmp);
});

test('lockfile.js documents the two-tree invariant exception', async () => {
  const src = await readFile(path.resolve('scripts/lib/lockfile.js'), 'utf8');
  const hasNote =
    src.includes('two-tree') ||
    src.includes('workspace-guard exception') ||
    src.includes('explicit narrow exception');
  assert.ok(
    hasNote,
    'lockfile.js MUST document the two-tree invariant exception (RESEARCH.md Open Q §1 Option B)',
  );
});
