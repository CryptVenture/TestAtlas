// test/scripts/update-manifest-excludes-runtime-cache.test.js
//
// Quick 260506-jsh — the regenerated install-manifest must EXCLUDE the
// runtime cache file (`.testatlas/.update-cache.json`). Including it
// causes the next `update` to report drift on the cache file (which
// mutates by definition every time checkForUpdate runs).
//
// User-observed scenario (post-v1.1.3 ship):
//
//   $ npx @webventures/testatlas update
//   ⚠ Content drift detected vs install-manifest (1 file):
//   ⚠   - .testatlas/.update-cache.json
//   ⚠ Run with --force-reinstall to re-extract the suite (preserves _testatlas/ workspace).
//
// The regenerated manifest from the previous update walked
// .testatlas/ and included `.update-cache.json` in its files[]. The next
// update ran checkForUpdate (which rewrites the cache), then drift
// detection saw the hash had changed.
//
// Both `.update-cache.json` and `.install-manifest.json` are runtime
// state; neither belongs in the manifest's files[] inventory.

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runInit } from '../../scripts/lib/install-core.js';
import { _testHooks as tarballHooks } from '../../scripts/lib/tarball.js';
import { runUpdate } from '../../scripts/lib/update-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const QUIET = () => {};

function installTarballHooks() {
  tarballHooks.downloadTarball = async (_v, dst) => {
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, 'fake-tarball', 'utf8');
    return dst;
  };
  tarballHooks.verifyChecksum = async () => {};
  tarballHooks.extractTarball = async (_t, dstDir) => {
    await mkdir(dstDir, { recursive: true });
    await cp(path.join(REPO_ROOT, '.testatlas'), dstDir, { recursive: true });
    await writeFile(path.join(dstDir, 'VERSION'), '1.1.4\n', 'utf8');
  };
}

function clearTarballHooks() {
  delete tarballHooks.downloadTarball;
  delete tarballHooks.verifyChecksum;
  delete tarballHooks.extractTarball;
}

async function setManifestSuiteVersion(target, version) {
  const p = path.join(target, '.testatlas', '.install-manifest.json');
  const m = JSON.parse(await readFile(p, 'utf8'));
  m.suiteVersion = version;
  await writeFile(p, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
}

test('regenerated manifest excludes .update-cache.json (runtime state)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-cache-excl-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );
  await setManifestSuiteVersion(target, '1.0.0');

  // Plant a stale update-cache.json before the swap (simulating a real-world
  // install where checkForUpdate has run at least once).
  await writeFile(
    path.join(target, '.testatlas', '.update-cache.json'),
    JSON.stringify({ checkedAt: Date.now() - 1, latestVersion: '1.0.0' }),
  );

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '1.1.4',
    latestVersion: '1.1.4',
    logger: QUIET,
    noUpdateCheck: true,
  });

  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  const cacheEntry = manifest.files.find((f) => f.path === '.testatlas/.update-cache.json');
  assert.equal(
    cacheEntry,
    undefined,
    `regenerated manifest must NOT track .update-cache.json (runtime cache); got entry: ${JSON.stringify(cacheEntry)}`,
  );

  const manifestSelfEntry = manifest.files.find(
    (f) => f.path === '.testatlas/.install-manifest.json',
  );
  assert.equal(
    manifestSelfEntry,
    undefined,
    'regenerated manifest must NOT track .install-manifest.json (itself)',
  );
});

test('subsequent update-check + drift-check chain is stable (no spurious drift on cache mutation)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-stability-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );
  await setManifestSuiteVersion(target, '1.0.0');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  // First update: 1.0.0 → 1.1.4
  await runUpdate({
    target,
    currentVersion: '1.1.4',
    latestVersion: '1.1.4',
    logger: QUIET,
    noUpdateCheck: true,
  });

  // Simulate update-check rewriting the cache (different content)
  await writeFile(
    path.join(target, '.testatlas', '.update-cache.json'),
    JSON.stringify({ checkedAt: Date.now(), latestVersion: '1.1.4' }),
  );

  // Second update at same version → must NOT report drift (cache mutation is OK).
  const result = await runUpdate({
    target,
    currentVersion: '1.1.4',
    latestVersion: '1.1.4',
    logger: QUIET,
    noUpdateCheck: true,
  });

  assert.notEqual(
    result.status,
    'drift-detected',
    `cache mutation must not trigger drift; got ${JSON.stringify(result)}`,
  );
  assert.equal(result.status, 'up-to-date', `expected up-to-date; got ${result.status}`);
});
