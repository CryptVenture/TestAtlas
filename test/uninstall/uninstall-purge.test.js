// test/uninstall/uninstall-purge.test.js
//
// Plan 07-02 Task 2 — `--purge` removes _testatlas/ in addition to suite files.

import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { runUninstall } from '../../scripts/uninstall.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const QUIET = () => {};

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-uninstall-purge-'));
}

async function withTmp(t, run) {
  const dir = await makeTmp();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return await run(dir);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

test('uninstall --purge: removes both .testatlas/ AND _testatlas/', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    const survivor = path.join(target, '_testatlas', 'SHOULD_BE_PURGED.txt');
    await writeFile(survivor, 'will be removed\n');

    const result = await runUninstall({ target, purge: true, logger: QUIET });
    assert.equal(result.status, 'uninstalled');
    assert.ok(result.purged === true, 'result.purged should be true');

    assert.ok(!(await exists(path.join(target, '.testatlas'))), '.testatlas/ should be gone');
    assert.ok(!(await exists(path.join(target, '_testatlas'))), '_testatlas/ should be purged');
    assert.ok(!(await exists(survivor)), 'workspace marker should be purged');
  });
});

test('uninstall --purge --dry-run: prints purge plan, writes nothing', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    const lines = [];
    const result = await runUninstall({
      target,
      purge: true,
      dryRun: true,
      logger: (m) => lines.push(m),
    });
    assert.equal(result.status, 'dry-run');
    assert.ok(await exists(path.join(target, '_testatlas')), '_testatlas/ must remain');
    const joined = lines.join('\n');
    assert.match(joined, /_testatlas/, 'dry-run output must mention _testatlas/');
    assert.match(joined, /\[dry-run\]/, 'dry-run output must contain [dry-run] tag');
  });
});
