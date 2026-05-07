// test/scripts/update-detects-content-drift.test.js
//
// Quick 260506-jsc — when local .testatlas/ has drifted from the
// install-manifest, `update` must NOT report "Already up to date" even when
// the local pkg.version equals the latest GH release.
//
// User-observed scenario: prompts/scripts/schemas in `.testatlas/` get
// modified (manual edit, partial install, or a previous failed update
// mid-swap). Comparing only on package.json version says "up to date" while
// the on-disk content has drifted. Drift detection MUST surface this so the
// user can re-sync.
//
// Contract:
//   - With manifest present + one tracked file mutated on disk, runUpdate
//     returns status='drift-detected'.
//   - The result lists the drifted file path(s).
//   - When the manifest matches every file on disk, runUpdate falls through
//     to the existing 'up-to-date' verdict.

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
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-update-drift-'));
  t.after(async () => {
    await rm(target, { recursive: true, force: true });
  });
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Phase 18-01 / ISSUE-011: seed permissive override so runUpdate's gate passes.
  await writeFile(
    path.join(target, 'testatlas.config.json'),
    JSON.stringify({ safeMode: false, allowDestructiveActions: true }),
  );
  return target;
}

test('runUpdate against drifted .testatlas/ → status=drift-detected', async (t) => {
  const target = await installFixture(t);

  // Mutate one tracked file in .testatlas/ (bootstrap.md is always present).
  const driftedPath = path.join(target, '.testatlas', 'bootstrap.md');
  const original = await readFile(driftedPath, 'utf8');
  await writeFile(driftedPath, `${original}\n# DRIFT MARKER\n`, 'utf8');

  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

  const result = await runUpdate({
    target,
    currentVersion: pkg.version,
    latestVersion: pkg.version, // version-equal: triggers drift check before short-circuit
    logger: QUIET,
    noUpdateCheck: true,
  });

  assert.equal(
    result.status,
    'drift-detected',
    `expected drift-detected; got ${JSON.stringify(result)}`,
  );
  assert.ok(Array.isArray(result.drifted), 'result.drifted must be an array');
  assert.ok(result.drifted.length >= 1, 'at least one drifted entry');
  // bootstrap.md must appear in the drifted list (POSIX path, .testatlas-relative).
  const driftedSet = new Set(result.drifted.map((d) => (typeof d === 'string' ? d : d.path)));
  assert.ok(
    [...driftedSet].some((p) => p.endsWith('bootstrap.md')),
    `expected bootstrap.md in drifted list; got: ${[...driftedSet].join(', ')}`,
  );
});

test('runUpdate against in-sync .testatlas/ → falls through to up-to-date', async (t) => {
  const target = await installFixture(t);

  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const result = await runUpdate({
    target,
    currentVersion: pkg.version,
    latestVersion: pkg.version,
    logger: QUIET,
    noUpdateCheck: true,
  });
  assert.equal(
    result.status,
    'up-to-date',
    `clean install + version-match must remain up-to-date; got ${JSON.stringify(result)}`,
  );
});

test('runUpdate logs the drifted file paths so user has actionable info', async (t) => {
  const target = await installFixture(t);
  const driftedPath = path.join(target, '.testatlas', 'bootstrap.md');
  const original = await readFile(driftedPath, 'utf8');
  await writeFile(driftedPath, `${original}\n# drift\n`, 'utf8');

  const messages = [];
  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const result = await runUpdate({
    target,
    currentVersion: pkg.version,
    latestVersion: pkg.version,
    logger: (m) => messages.push(String(m)),
    noUpdateCheck: true,
  });
  assert.equal(result.status, 'drift-detected');
  const blob = messages.join('\n');
  assert.match(blob, /drift/i, `expected drift mention in user output; saw:\n${blob}`);
  assert.match(blob, /bootstrap\.md/, `expected drifted file path mentioned; saw:\n${blob}`);
});
