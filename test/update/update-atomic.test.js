// test/update/update-atomic.test.js
//
// Plan 07-03 Task 3 — atomic update happy path (UPDATE-02).
//
// Test seam strategy:
//   - tarball.js exports `_testHooks` for downloadTarball/extractTarball
//     overrides. These hooks bypass the network entirely; the test stubs
//     produce a real on-disk staged suite tree from a fixture/snapshot.
//   - We construct a "v0.2.0" fake suite by copying the current suite
//     tree (.testatlas/) and bumping the version stamp inside it. This
//     lets us assert post-swap that .testatlas/ contains the staged content.

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { isLocked } from '../../scripts/lib/lockfile.js';
import { _testHooks as tarballHooks } from '../../scripts/lib/tarball.js';
import { runUpdate } from '../../scripts/lib/update-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'migrations-fixture');
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

/**
 * Build a fake "staged" suite tree at `stageDir`. We copy the current
 * .testatlas/ from REPO_ROOT (excluding the test-workspace fixture).
 * Optionally include a `migrations/` subdir mirroring the fixture so the
 * runUpdate flow exercises the migration step end-to-end.
 *
 * @param {string} stageDir
 * @param {{ withMigrations?: boolean }} [opts]
 */
async function buildFakeStage(stageDir, opts = {}) {
  await mkdir(stageDir, { recursive: true });
  const srcSuite = path.join(REPO_ROOT, '.testatlas');
  const dstSuite = path.join(stageDir);
  await cp(srcSuite, dstSuite, { recursive: true });
  // Mark it as "v0.2.0" by updating VERSION file.
  await writeFile(path.join(dstSuite, 'VERSION'), '0.2.0\n', 'utf8');
  if (opts.withMigrations) {
    const dstMig = path.join(stageDir, 'migrations');
    await mkdir(dstMig, { recursive: true });
    await cp(path.join(FIXTURE_DIR, 'v1-to-v2.js'), path.join(dstMig, 'v1-to-v2.js'));
    await cp(path.join(FIXTURE_DIR, 'v2-to-v3.js'), path.join(dstMig, 'v2-to-v3.js'));
  }
}

/**
 * Install hooks that mock tarball download+extract: the "tarball" never
 * actually exists on disk; extractTarball builds the stage dir directly.
 *
 * @param {{ withMigrations?: boolean }} [opts]
 */
function installTarballHooks(opts = {}) {
  tarballHooks.downloadTarball = async (_version, dst) => {
    // Just create an empty marker file to satisfy verifyChecksum no-op.
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, 'fake-tarball', 'utf8');
    return dst;
  };
  tarballHooks.verifyChecksum = async () => {
    // No-op
  };
  tarballHooks.extractTarball = async (_tarballPath, dstDir) => {
    await buildFakeStage(dstDir, opts);
  };
}

function clearTarballHooks() {
  delete tarballHooks.downloadTarball;
  delete tarballHooks.verifyChecksum;
  delete tarballHooks.extractTarball;
}

test('update-atomic: full flow — stage → swap → backup → prune → lock released', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-atomic-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    logger: QUIET,
  });

  // .testatlas/ exists (post-swap) and now reads VERSION=0.2.0
  const ver = await readFile(path.join(target, '.testatlas', 'VERSION'), 'utf8');
  assert.equal(ver.trim(), '0.2.0');

  // At least one .testatlas.backup-* directory exists.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 1);

  // Lockfile released.
  const state = await isLocked(target);
  assert.equal(state.held, false);

  // No staging dir leftover.
  const stagings = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith('.testatlas.staging-'),
  );
  assert.equal(stagings.length, 0);
});

test('update-atomic: _testatlas/ workspace untouched when no migrations', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-atomic-ws-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Plant a marker file in _testatlas/ to prove it survives.
  const marker = path.join(target, '_testatlas', 'user-marker.txt');
  await writeFile(marker, 'user-data');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    logger: QUIET,
  });

  assert.equal(await exists(marker), true);
  const content = await readFile(marker, 'utf8');
  assert.equal(content, 'user-data');
});

test('update-atomic: with migrations, schemaVersion bumps and _testatlas/ transformed', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-mig-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Plant scratch/ so v1-to-v2 has work.
  await mkdir(path.join(target, '_testatlas', 'scratch'), { recursive: true });
  await writeFile(path.join(target, '_testatlas', 'scratch', 'k.txt'), 'data');

  installTarballHooks({ withMigrations: true });
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    logger: QUIET,
  });

  // Migrations applied: scratch → sandbox; .schema-marker present.
  assert.equal(await exists(path.join(target, '_testatlas', 'sandbox')), true);
  assert.equal(await exists(path.join(target, '_testatlas', 'scratch')), false);
  assert.equal(await exists(path.join(target, '_testatlas', '.schema-marker')), true);

  // schemaVersion bumped — but post-swap we read the staged manifest, not the
  // pre-swap one. The migrations ran against the original manifest BEFORE the
  // swap, so the backup carries the bumped schemaVersion. Verify both:
  const entries = await readdir(target, { withFileTypes: true });
  const backupDir = entries.find((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.ok(backupDir);
  // The pre-swap manifest (now in backup) should have schemaVersion=3.
  const backupManifestPath = path.join(target, backupDir.name, '.install-manifest.json');
  const backupManifest = JSON.parse(await readFile(backupManifestPath, 'utf8'));
  assert.equal(backupManifest.schemaVersion, 3);
});

test('update-atomic: backup pruning keeps last 3 .testatlas.backup-* dirs', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-prune-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Plant 5 fake backup dirs with sortable timestamps.
  const ts = [
    '2024-01-01T00-00-00-000Z',
    '2024-02-01T00-00-00-000Z',
    '2024-03-01T00-00-00-000Z',
    '2024-04-01T00-00-00-000Z',
    '2024-05-01T00-00-00-000Z',
  ];
  for (const t of ts) {
    await mkdir(path.join(target, `.testatlas.backup-${t}`), { recursive: true });
  }

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    logger: QUIET,
  });

  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'))
    .map((e) => e.name)
    .sort();
  // After update we created a 6th backup, then pruned to last 3 (keep newest).
  assert.equal(backups.length, 3);
  // Oldest two from our planted timestamps should be gone (Jan, Feb).
  assert.ok(!backups.some((n) => n.includes('2024-01-01')));
  assert.ok(!backups.some((n) => n.includes('2024-02-01')));
  // Newest planted (May) should remain.
  assert.ok(backups.some((n) => n.includes('2024-05-01')));
});

test('update-atomic: already-up-to-date short-circuits with no swap', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-uptodate-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // No tarball hooks installed — should never be called.
  let downloadCalled = false;
  tarballHooks.downloadTarball = async () => {
    downloadCalled = true;
    throw new Error('should not be reached');
  };
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.1.0',
    logger: QUIET,
  });

  assert.equal(downloadCalled, false);
  // No backups created.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 0);
});

test('update-atomic: --force-reinstall proceeds even when versions match', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-force-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.1.0',
    forceReinstall: true,
    logger: QUIET,
  });

  // A backup was created — proves the swap happened.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 1);
});

test('update-atomic: lock held by another fresh PID throws Lock held', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-locked-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Pre-acquire lock as current process (alive PID).
  const { acquireLock, releaseLock } = await import('../../scripts/lib/lockfile.js');
  await acquireLock(target, { pid: process.pid, holdReason: 'test-other' });
  t.after(() => releaseLock(target));

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await assert.rejects(
    () =>
      runUpdate({
        target,
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
        logger: QUIET,
      }),
    /Lock held/i,
  );

  // No swap occurred — no backup dir.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 0);
});

test('update-atomic: dry-run prints plan, no writes, no lock leftover', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-dry-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  installTarballHooks();
  t.after(() => clearTarballHooks());

  const out = [];
  await runUpdate({
    target,
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    dryRun: true,
    logger: (msg) => out.push(msg),
  });

  // No swap.
  const entries = await readdir(target, { withFileTypes: true });
  const backups = entries.filter((e) => e.isDirectory() && e.name.startsWith('.testatlas.backup-'));
  assert.equal(backups.length, 0);

  // Plan was printed.
  const joined = out.join('\n');
  assert.match(joined, /dry-run/i);
  assert.match(joined, /0\.2\.0/);

  // Lock released.
  const state = await isLocked(target);
  assert.equal(state.held, false);
});
