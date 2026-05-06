// test/scripts/install-writes-manifest.test.js
//
// Quick 260506-jsc — regression guard: install-core.runInit MUST write
// .testatlas/.install-manifest.json with `files: [{path, hash, ...}]`.
//
// This is the source of truth that update-core.detectInstallDrift() consults.
// If a future refactor drops the manifest emit, drift detection silently
// fails open (every update reports "in-sync" even when the user has stale
// content). This test guards against that regression.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { INSTALL_MANIFEST_PATH } from '../../scripts/lib/constants.js';
import { runInit } from '../../scripts/lib/install-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

test('install-core writes .install-manifest.json with version + files[].path + files[].hash', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });

  const result = await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  assert.equal(result.status, 'installed');

  const manifestPath = path.join(target, INSTALL_MANIFEST_PATH);
  const st = await stat(manifestPath);
  assert.ok(st.isFile(), `manifest must be a file at ${manifestPath}`);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // Drift-detection contract: the fields below are what detectInstallDrift
  // consumes. Pinning them here guards against future schema changes that
  // would silently break drift detection.
  assert.equal(typeof manifest.suiteVersion, 'string', 'manifest.suiteVersion required');
  assert.ok(
    semverShape(manifest.suiteVersion),
    `expected semver-shaped suiteVersion; got "${manifest.suiteVersion}"`,
  );
  assert.ok(Array.isArray(manifest.files), 'manifest.files must be an array');
  assert.ok(manifest.files.length > 0, 'manifest.files must be non-empty');

  // Sample 5 files; each must have path + hash (POSIX path; non-empty hash).
  const sample = manifest.files.slice(0, 5);
  for (const entry of sample) {
    assert.equal(
      typeof entry.path,
      'string',
      `manifest entry.path must be string: ${JSON.stringify(entry)}`,
    );
    assert.ok(!entry.path.startsWith('/'), `entry.path must be relative POSIX: "${entry.path}"`);
    assert.ok(
      !entry.path.includes('\\'),
      `entry.path must be POSIX (no backslashes): "${entry.path}"`,
    );
    assert.equal(
      typeof entry.hash,
      'string',
      `manifest entry.hash must be string: ${JSON.stringify(entry)}`,
    );
    assert.ok(
      /^[0-9a-f]{16,64}$/.test(entry.hash),
      `entry.hash must be 16-64 hex chars; got "${entry.hash}"`,
    );
  }
});

function semverShape(s) {
  return /^\d+\.\d+\.\d+/.test(String(s));
}
