// test/uninstall/uninstall-force-untracked.test.js
//
// Plan 07-02 Task 2 — `--force-untracked` allows uninstall when the manifest
// is missing or corrupt; nukes .testatlas/ blindly with a warning.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runUninstall } from '../../scripts/uninstall.js';

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-uninstall-force-'));
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

test('uninstall --force-untracked: no manifest → nukes .testatlas/ with warning', async (t) => {
  await withTmp(t, async (target) => {
    // Plant a fake .testatlas/ tree without any manifest.
    const ttDir = path.join(target, '.testatlas');
    await mkdir(path.join(ttDir, 'commands'), { recursive: true });
    await writeFile(path.join(ttDir, 'README.md'), '# fake\n');
    await writeFile(path.join(ttDir, 'commands', 'foo.md'), '# foo\n');

    const warns = [];
    const result = await runUninstall({
      target,
      forceUntracked: true,
      logger: (m) => warns.push(m),
    });
    assert.equal(result.status, 'uninstalled');
    assert.equal(result.fallback, 'force-untracked');

    assert.ok(!(await exists(ttDir)), '.testatlas/ must be removed under --force-untracked');
    const joined = warns.join('\n');
    assert.match(joined, /manifest absent|fallback/i, `expected fallback warning, got:\n${joined}`);
  });
});

test('uninstall --force-untracked --purge: also removes _testatlas/', async (t) => {
  await withTmp(t, async (target) => {
    await mkdir(path.join(target, '.testatlas'), { recursive: true });
    await writeFile(path.join(target, '.testatlas', 'a'), 'x');
    await mkdir(path.join(target, '_testatlas'), { recursive: true });
    await writeFile(path.join(target, '_testatlas', 'state.json'), '{}');

    const result = await runUninstall({
      target,
      forceUntracked: true,
      purge: true,
      logger: () => {},
    });
    assert.equal(result.status, 'uninstalled');
    assert.ok(!(await exists(path.join(target, '.testatlas'))));
    assert.ok(!(await exists(path.join(target, '_testatlas'))));
  });
});
