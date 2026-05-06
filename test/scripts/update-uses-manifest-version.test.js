// test/scripts/update-uses-manifest-version.test.js
//
// Bug A fix — runUpdate must source `currentVersion` from the local install
// manifest (`<target>/.testatlas/.install-manifest.json#suiteVersion`), NOT
// from the caller-supplied opts.currentVersion (which is the running CLI's
// own pkg.version under bin/testatlas.js).
//
// User-observed scenario (post-v1.1.1 ship): user ran `npx
// @webventures/testatlas update` against a target whose .testatlas/ was
// installed at v1.1.0. The npx-cached CLI was at v1.1.1. update reported
// "Already up to date (current 1.1.1, latest …)" and skipped the swap —
// the local install never got the v1.1.1 commands/scripts/schemas.
//
// The CLI version is NOT the version of what's installed at <target>. The
// install manifest is the authoritative source of truth for "what's in
// <target>/.testatlas/ right now".

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runInit } from '../../scripts/lib/install-core.js';
import { runUpdate } from '../../scripts/lib/update-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const QUIET = () => {};

async function installFixture(t) {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-mfst-ver-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  return target;
}

async function setManifestVersion(target, version) {
  const manifestPath = path.join(target, '.testatlas', '.install-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.suiteVersion = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('runUpdate prefers manifest.suiteVersion over opts.currentVersion (Bug A core)', async (t) => {
  const target = await installFixture(t);
  // Simulate older install: manifest pinned at 1.0.0
  await setManifestVersion(target, '1.0.0');

  // Caller (bin/testatlas.js) passes the running CLI's pkg.version (1.1.1).
  // latestVersion=1.1.1 (the upstream "what's available").
  // Pre-fix: currentVersion=1.1.1 → shouldUpdate(1.1.1, 1.1.1)===false → up-to-date noop.
  // Post-fix: currentVersion=1.0.0 (from manifest) → shouldUpdate(1.0.0, 1.1.1)===true → swap fires.
  const result = await runUpdate({
    target,
    currentVersion: '1.1.1',
    latestVersion: '1.1.1',
    dryRun: true, // short-circuit before tarball download; previousVersion is the proof
    logger: QUIET,
    noUpdateCheck: true,
  });

  assert.equal(result.status, 'dry-run', `expected dry-run; got ${JSON.stringify(result)}`);
  assert.equal(
    result.previousVersion,
    '1.0.0',
    `runUpdate must use manifest.suiteVersion (1.0.0), not opts.currentVersion (1.1.1)`,
  );
  assert.equal(result.newVersion, '1.1.1');
});

test('runUpdate falls back to opts.currentVersion when manifest is absent (legacy install)', async (t) => {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-no-mfst-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });

  // No .testatlas/ at all → drift detection fires install-missing (Quick 260506-jsc Fix #3),
  // before version compare. Our Bug A fix must not regress that.
  const result = await runUpdate({
    target,
    currentVersion: '1.1.1',
    latestVersion: '1.1.1',
    logger: QUIET,
    noUpdateCheck: true,
  });
  assert.equal(result.status, 'install-missing');
  // previousVersion is the caller's value (1.1.1) when no manifest exists.
  assert.equal(result.previousVersion, '1.1.1');
});

test('runUpdate against in-sync install at latest version → up-to-date with manifest version surfaced', async (t) => {
  const target = await installFixture(t);
  // Manifest matches latest exactly.
  await setManifestVersion(target, '1.1.1');

  const messages = [];
  const result = await runUpdate({
    target,
    currentVersion: '1.0.0', // caller passes wrong/old value
    latestVersion: '1.1.1',
    logger: (m) => messages.push(String(m)),
    noUpdateCheck: true,
  });
  // Manifest says 1.1.1 → currentVersion=1.1.1, latest=1.1.1 → no update
  // → drift detect fires → 'in-sync' → falls through to up-to-date
  assert.equal(result.status, 'up-to-date');
  assert.equal(result.previousVersion, '1.1.1');
  // Message should reflect the TRUE current (manifest) not the caller's bogus 1.0.0.
  const blob = messages.join('\n');
  assert.match(blob, /1\.1\.1/, `expected 1.1.1 in message; saw:\n${blob}`);
  assert.doesNotMatch(blob, /1\.0\.0/, `must not surface caller's stale 1.0.0; saw:\n${blob}`);
});

test('runUpdate triggers real bump path when manifest is older than latest', async (t) => {
  const target = await installFixture(t);
  await setManifestVersion(target, '1.0.0');

  const result = await runUpdate({
    target,
    currentVersion: '1.1.1', // CLI is at 1.1.1 (npx-cached)
    latestVersion: '1.1.1',
    dryRun: true,
    logger: QUIET,
    noUpdateCheck: true,
  });
  // Manifest 1.0.0 < latest 1.1.1 → dry-run shows "Would update from 1.0.0 → 1.1.1"
  assert.equal(result.status, 'dry-run');
  assert.equal(result.previousVersion, '1.0.0');
  assert.equal(result.newVersion, '1.1.1');
});
