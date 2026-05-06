// test/scripts/update-regenerates-manifest-post-swap.test.js
//
// Quick 260506-jsg — Bug C: post-update, the install manifest at
// `<target>/.testatlas/.install-manifest.json` was being WIPED. The atomic
// swap replaced .testatlas/ wholesale with the staged tarball content,
// which doesn't contain the manifest (manifest is created by runInit, not
// shipped in the npm tarball).
//
// Effect: drift detection (Quick 260506-jsc Fix #3) silently dies after
// the first update — every subsequent update sees `kind: 'no-manifest'`
// and falls through to the legacy "Already up to date" path.
//
// Fix: after a successful atomic swap, regenerate the manifest by walking
// the new .testatlas/ tree, hashing each file, and preserving adapters/mode
// from the backed-up old manifest. The manifest is the contract for drift
// detection, so it MUST be present after every update.

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function setManifestSuiteVersion(target, version) {
  const p = path.join(target, '.testatlas', '.install-manifest.json');
  const m = JSON.parse(await readFile(p, 'utf8'));
  m.suiteVersion = version;
  await writeFile(p, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
}

function installTarballHooks() {
  tarballHooks.downloadTarball = async (_version, dst) => {
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, 'fake-tarball', 'utf8');
    return dst;
  };
  tarballHooks.verifyChecksum = async () => {};
  tarballHooks.extractTarball = async (_tarballPath, dstDir) => {
    // Build a fake "v1.1.2" stage from the current REPO_ROOT/.testatlas tree.
    await mkdir(dstDir, { recursive: true });
    await cp(path.join(REPO_ROOT, '.testatlas'), dstDir, { recursive: true });
    await writeFile(path.join(dstDir, 'VERSION'), '1.1.2\n', 'utf8');
  };
}

function clearTarballHooks() {
  delete tarballHooks.downloadTarball;
  delete tarballHooks.verifyChecksum;
  delete tarballHooks.extractTarball;
}

test('runUpdate regenerates .install-manifest.json after atomic swap', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-postswap-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  await setManifestSuiteVersion(target, '1.0.0');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  const result = await runUpdate({
    target,
    currentVersion: '1.1.2',
    latestVersion: '1.1.2',
    logger: QUIET,
    noUpdateCheck: true,
  });
  assert.equal(result.status, 'updated', `update should have run; got ${JSON.stringify(result)}`);

  // Manifest must exist post-swap.
  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  assert.equal(
    await exists(manifestPath),
    true,
    'install-manifest.json must exist after update — drift detection depends on it',
  );

  // suiteVersion must reflect the NEW version, not the old.
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.suiteVersion, '1.1.2');

  // files[] must be non-empty and reflect the actual installed tree.
  assert.ok(Array.isArray(manifest.files), 'manifest.files must be an array');
  assert.ok(manifest.files.length > 0, 'manifest.files must be non-empty');

  // Spot-check: bootstrap.md should appear with a hash.
  const bootstrap = manifest.files.find((f) => f.path?.endsWith('bootstrap.md'));
  assert.ok(bootstrap, 'bootstrap.md must appear in regenerated manifest.files');
  assert.match(bootstrap.hash, /^[0-9a-f]{16,64}$/, 'bootstrap.md hash must be hex-shaped');
});

test('regenerated manifest preserves adapters list from backup', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-adapters-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  // Pretend claude-code adapter was installed
  await mkdir(path.join(target, '.claude'), { recursive: true });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  await setManifestSuiteVersion(target, '1.0.0');

  // Capture original adapters list before update
  const origManifest = JSON.parse(
    await readFile(path.join(target, '.testatlas', '.install-manifest.json'), 'utf8'),
  );
  const origAdapters = [...origManifest.adapters].sort();
  assert.ok(origAdapters.includes('generic'), 'baseline: generic must always be there');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '1.1.2',
    latestVersion: '1.1.2',
    logger: QUIET,
    noUpdateCheck: true,
  });

  const newManifest = JSON.parse(
    await readFile(path.join(target, '.testatlas', '.install-manifest.json'), 'utf8'),
  );
  const newAdapters = [...newManifest.adapters].sort();
  assert.deepStrictEqual(
    newAdapters,
    origAdapters,
    `adapters list must be preserved across update (was ${origAdapters.join(',')}; got ${newAdapters.join(',')})`,
  );
});

test('regenerated manifest preserves mode:global when backup had it', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-global-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET, global: true });
  // Hand-set suiteVersion + add mode:global (runInit may have set already; defensive)
  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  const m = JSON.parse(await readFile(manifestPath, 'utf8'));
  m.suiteVersion = '1.0.0';
  m.mode = 'global';
  await writeFile(manifestPath, `${JSON.stringify(m, null, 2)}\n`, 'utf8');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  await runUpdate({
    target,
    currentVersion: '1.1.2',
    latestVersion: '1.1.2',
    logger: QUIET,
    noUpdateCheck: true,
  });

  const newManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(
    newManifest.mode,
    'global',
    `mode:global must be preserved after update; got ${JSON.stringify(newManifest.mode)}`,
  );
});

test('subsequent update against regenerated manifest detects drift correctly (drift-detection chain stays alive)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-mfst-chain-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  await setManifestSuiteVersion(target, '1.0.0');

  installTarballHooks();
  t.after(() => clearTarballHooks());

  // First update: 1.0.0 → 1.1.2
  await runUpdate({
    target,
    currentVersion: '1.1.2',
    latestVersion: '1.1.2',
    logger: QUIET,
    noUpdateCheck: true,
  });

  // Mutate one tracked file (drift)
  const driftedPath = path.join(target, '.testatlas', 'bootstrap.md');
  const original = await readFile(driftedPath, 'utf8');
  await writeFile(driftedPath, `${original}\n# DRIFT MARKER POST-UPDATE\n`, 'utf8');

  // Second update with same version → drift check must fire (manifest exists,
  // hashes don't match). Pre-fix this would return 'up-to-date' because no
  // manifest existed → 'no-manifest' path → fall through to legacy.
  const secondResult = await runUpdate({
    target,
    currentVersion: '1.1.2',
    latestVersion: '1.1.2',
    logger: QUIET,
    noUpdateCheck: true,
  });

  assert.equal(
    secondResult.status,
    'drift-detected',
    `second update must detect drift on the regenerated manifest; got ${secondResult.status}`,
  );
  assert.ok(Array.isArray(secondResult.drifted) && secondResult.drifted.length >= 1);
  assert.ok(
    secondResult.drifted.some((d) => (typeof d === 'string' ? d : d.path).endsWith('bootstrap.md')),
    'drifted list must include bootstrap.md',
  );
});
