// test/update/update-rollback.test.js
//
// Plan 07-03 Task 3 — rollback on swap failure + lock release on errors.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { isLocked } from '../../scripts/lib/lockfile.js';
import { _testHooks as tarballHooks } from '../../scripts/lib/tarball.js';
import { runUpdate, _testHooks as updateHooks } from '../../scripts/lib/update-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const _FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'migrations-fixture');
const SUITE_VERSION = (
  await readFile(path.join(REPO_ROOT, '.testatlas', 'VERSION'), 'utf8')
).trim();
const QUIET = () => {};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

function installSuccessfulTarballHooks() {
  tarballHooks.downloadTarball = async (_v, dst) => {
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, 'fake', 'utf8');
    return dst;
  };
  tarballHooks.verifyChecksum = async () => {};
  tarballHooks.extractTarball = async (_t, dstDir) => {
    await mkdir(dstDir, { recursive: true });
    // Stage with VERSION marker so the swap is observable.
    await writeFile(path.join(dstDir, 'VERSION'), '0.2.0\n');
  };
}

function clearAllHooks() {
  delete tarballHooks.downloadTarball;
  delete tarballHooks.verifyChecksum;
  delete tarballHooks.extractTarball;
  delete updateHooks.renameImpl;
}

test('update-rollback: swap-rename failure reverses the backup-rename and rethrows', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-rollback-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );

  installSuccessfulTarballHooks();

  // Inject a rename impl that fails on the SECOND call (the staging→.testatlas
  // rename). The first call (.testatlas → backup) succeeds.
  let callIndex = 0;
  const realRename = (await import('node:fs/promises')).rename;
  updateHooks.renameImpl = async (src, dst) => {
    callIndex++;
    if (callIndex === 2) {
      const err = new Error('synthetic EPERM');
      err.code = 'EPERM';
      throw err;
    }
    return realRename(src, dst);
  };
  t.after(() => clearAllHooks());

  await assert.rejects(
    () =>
      runUpdate({
        target,
        currentVersion: SUITE_VERSION,
        latestVersion: '99.0.0',
        logger: QUIET,
      }),
    /EPERM|synthetic/,
  );

  // .testatlas/ should be back in place (rollback reversed the backup-rename).
  assert.equal(await exists(path.join(target, '.testatlas')), true);
  // No leftover .testatlas.backup-*/ — rollback unwound it.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 0);
  // The original install's VERSION should still be present (not the staged one).
  const ver = (await readFile(path.join(target, '.testatlas', 'VERSION'), 'utf8')).trim();
  assert.equal(ver, SUITE_VERSION);
  // Lock released even on failure.
  const state = await isLocked(target);
  assert.equal(state.held, false);
});

test('update-rollback: migration failure leaves suite untouched (abort BEFORE swap)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-mig-fail-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );

  // Build a stage with a migrations dir containing a deliberately-broken file.
  tarballHooks.downloadTarball = async (_v, dst) => {
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, 'fake', 'utf8');
    return dst;
  };
  tarballHooks.verifyChecksum = async () => {};
  tarballHooks.extractTarball = async (_t, dstDir) => {
    await mkdir(dstDir, { recursive: true });
    await writeFile(path.join(dstDir, 'VERSION'), '0.2.0\n');
    const migDir = path.join(dstDir, 'migrations');
    await mkdir(migDir, { recursive: true });
    // A migration whose up() throws.
    await writeFile(
      path.join(migDir, 'v1-to-v2.js'),
      'export const fromSchema = 1; export const toSchema = 2; export const description = "fail"; export async function up(){ throw new Error("synthetic up failure"); }\n',
    );
  };
  t.after(() => clearAllHooks());

  await assert.rejects(
    () =>
      runUpdate({
        target,
        currentVersion: SUITE_VERSION,
        latestVersion: '99.0.0',
        logger: QUIET,
      }),
    /synthetic up failure/,
  );

  // .testatlas/ untouched — original VERSION.
  const ver = (await readFile(path.join(target, '.testatlas', 'VERSION'), 'utf8')).trim();
  assert.equal(ver, SUITE_VERSION);
  // No backup dir (swap never happened).
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 0);
  // No leftover staging dir (cleanup runs).
  const stagings = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith('.testatlas.staging-'),
  );
  assert.equal(stagings.length, 0);
  // Lock released.
  const state = await isLocked(target);
  assert.equal(state.held, false);
});

test('update-rollback: download failure releases lock + leaves .testatlas/ intact', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-dl-fail-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );

  tarballHooks.downloadTarball = async () => {
    throw new Error('synthetic network failure');
  };
  t.after(() => clearAllHooks());

  await assert.rejects(
    () =>
      runUpdate({
        target,
        currentVersion: SUITE_VERSION,
        latestVersion: '99.0.0',
        logger: QUIET,
      }),
    /synthetic network failure/,
  );

  // .testatlas/ still there.
  assert.equal(await exists(path.join(target, '.testatlas')), true);
  // Lock released.
  const state = await isLocked(target);
  assert.equal(state.held, false);
});
