// test/scripts/drift-skips-runtime-excluded.test.js
//
// Quick 260506-jsi — defense-in-depth for users with manifests written by
// older broken versions (v1.1.2 / v1.1.3) that included runtime state files
// in `manifest.files[]`. detectInstallDrift must skip those entries even
// when the manifest says they should be tracked.
//
// User-observed scenario (post-v1.1.4 ship):
//   $ npx @webventures/testatlas update     # CLI is now v1.1.4
//   ⚠ Content drift detected vs install-manifest (1 file):
//   ⚠   - .testatlas/.update-cache.json
//
// Their local manifest was written by v1.1.3's regenerator (which DID track
// .update-cache.json — the bug we fixed in v1.1.4 only fixes future
// manifests, not pre-existing ones). Every cache refresh by checkForUpdate
// now triggers spurious drift forever, until the manifest is regenerated.
//
// Fix: detectInstallDrift skips the same runtime-excluded set as
// regenerateInstallManifest (single source of truth). The contract is now:
// "the manifest may track runtime files for legacy reasons, but drift
// detection always treats them as exempt".

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runInit } from '../../scripts/lib/install-core.js';
import { detectInstallDrift } from '../../scripts/lib/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const QUIET = () => {};

async function plantLegacyManifestEntry(target, fileRelToTarget, content) {
  // Write the file
  const abs = path.join(target, ...fileRelToTarget.split('/'));
  await writeFile(abs, content, 'utf8');
  // Inject a stale entry into manifest.files[]
  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.push({
    path: fileRelToTarget,
    source: fileRelToTarget.replace(/^\.testatlas\//, ''),
    type: 'suite',
    // Hash a different content so the on-disk file appears drifted
    hash: 'a'.repeat(64),
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('detectInstallDrift skips .update-cache.json even when manifest tracks it (legacy v1.1.3 manifest compat)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-drift-runtime-cache-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Plant a stale manifest entry pointing at .update-cache.json (mimics v1.1.3
  // manifest where the regenerator incorrectly included the cache file).
  await plantLegacyManifestEntry(
    target,
    '.testatlas/.update-cache.json',
    JSON.stringify({ checkedAt: Date.now(), latestVersion: '1.0.0' }),
  );

  const drift = await detectInstallDrift(target);
  assert.equal(
    drift.kind,
    'in-sync',
    `expected in-sync (cache exempt); got ${JSON.stringify(drift)}`,
  );
});

test('detectInstallDrift skips .install-manifest.json self-reference if manifest tracks itself', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-drift-manifest-self-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Plant a stale manifest entry pointing at .install-manifest.json itself.
  // (Hypothetical edge case — defensive coverage.)
  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.push({
    path: '.testatlas/.install-manifest.json',
    source: '.install-manifest.json',
    type: 'suite',
    hash: 'b'.repeat(64),
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const drift = await detectInstallDrift(target);
  assert.equal(
    drift.kind,
    'in-sync',
    `expected in-sync (manifest-self exempt); got ${JSON.stringify(drift)}`,
  );
});

test('detectInstallDrift still flags real drift on tracked suite files', async (t) => {
  // Negative control: the runtime-excluded filter must not over-exempt.
  // Drift on a real file (bootstrap.md) still surfaces.
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-drift-still-fires-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });

  // Mutate bootstrap.md
  const bootstrap = path.join(target, '.testatlas', 'bootstrap.md');
  const original = await readFile(bootstrap, 'utf8');
  await writeFile(bootstrap, `${original}\n# DRIFT\n`, 'utf8');

  const drift = await detectInstallDrift(target);
  assert.equal(drift.kind, 'drift');
  const hits = drift.drifted.map((d) => d.path);
  assert.ok(
    hits.some((p) => p.endsWith('bootstrap.md')),
    `bootstrap.md drift must still fire; got: ${hits.join(',')}`,
  );
});
