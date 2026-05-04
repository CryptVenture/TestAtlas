// test/uninstall/uninstall.test.js
//
// Plan 07-02 Task 2 — Manifest-driven uninstall (happy path + validation).
//
// Setup pattern: each test creates a tmp dir, runs `runInit` to populate it,
// then exercises `runUninstall` variants and asserts file-system state.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INSTALL_MANIFEST_PATH } from '../../scripts/lib/constants.js';
import { runInit } from '../../scripts/lib/install-core.js';
import { runUninstall } from '../../scripts/uninstall.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const QUIET = () => {};

async function makeTmp() {
  return await mkdtemp(path.join(tmpdir(), 'testatlas-uninstall-'));
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

test('uninstall: removes every manifest-tracked file; preserves _testatlas/', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    // Pre-conditions
    assert.ok(await exists(path.join(target, '.testatlas')), '.testatlas/ should exist after init');
    assert.ok(await exists(path.join(target, '_testatlas')), '_testatlas/ should exist after init');
    // Plant a marker inside _testatlas/ to prove it survives.
    const survivor = path.join(target, '_testatlas', 'SURVIVOR.txt');
    await writeFile(survivor, 'should survive\n');

    const result = await runUninstall({ target, logger: QUIET });
    assert.equal(result.status, 'uninstalled');
    assert.ok(result.filesRemoved >= 1, `expected files removed, got ${result.filesRemoved}`);

    // .testatlas/ gone (or, at minimum, manifest gone — the strict promise is
    // "every manifest-tracked file removed").
    assert.ok(!(await exists(path.join(target, INSTALL_MANIFEST_PATH))), 'manifest must be gone');
    assert.ok(
      !(await exists(path.join(target, '.testatlas'))),
      '.testatlas/ should not exist (empty parents removed)',
    );

    // _testatlas/ preserved (default: --purge is opt-in)
    assert.ok(await exists(path.join(target, '_testatlas')), '_testatlas/ must be preserved');
    assert.ok(await exists(survivor), 'workspace marker must be preserved');
  });
});

test('uninstall: missing manifest → throws TESTATLAS_MANIFEST_MISSING', async (t) => {
  await withTmp(t, async (target) => {
    // Note: no runInit. Target has no .testatlas/.
    await assert.rejects(
      () => runUninstall({ target, logger: QUIET }),
      (err) => {
        assert.match(err.message, /Manifest missing or invalid/);
        return true;
      },
    );
  });
});

test('uninstall: corrupt manifest JSON → throws (refuses)', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    // Corrupt the manifest with one bad char
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    const original = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, `${original.slice(0, 5)}@@@${original.slice(5)}`);

    await assert.rejects(
      () => runUninstall({ target, logger: QUIET }),
      (err) => {
        assert.match(err.message, /Manifest missing or invalid/);
        return true;
      },
    );
  });
});

test('uninstall: --dry-run prints plan and writes nothing', async (t) => {
  await withTmp(t, async (target) => {
    await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
    const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
    assert.ok(await exists(manifestPath), 'manifest must exist before dry-run');

    const lines = [];
    const result = await runUninstall({
      target,
      dryRun: true,
      logger: (m) => lines.push(m),
    });
    assert.equal(result.status, 'dry-run');
    // FS unchanged: manifest still there
    assert.ok(await exists(manifestPath), 'dry-run must not delete manifest');
    // Some [dry-run] log line emitted
    const joined = lines.join('\n');
    assert.match(joined, /\[dry-run\]/, `expected [dry-run] log lines, got:\n${joined}`);
  });
});
