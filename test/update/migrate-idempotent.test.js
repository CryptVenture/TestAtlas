// test/update/migrate-idempotent.test.js
//
// Plan 07-03 Task 2 — applyMigrations idempotency: re-running on a workspace
// already migrated to the target schema is a no-op (no errors, no state change).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';
import { applyMigrations } from '../../scripts/lib/migrate.js';

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

async function makeWorkspaceAtV1() {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-migrate-idem-'));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  // Plant a `scratch/` dir so v1-to-v2 has work to do.
  await mkdir(path.join(target, '_testatlas', 'scratch'), { recursive: true });
  await writeFile(path.join(target, '_testatlas', 'scratch', 'note.txt'), 'hello');
  return target;
}

test('migrate-idempotent: v1-to-v2 renames scratch→sandbox, bumps schemaVersion to 2', async (t) => {
  const target = await makeWorkspaceAtV1();
  t.after(() => rm(target, { recursive: true, force: true }));

  await applyMigrations({
    target,
    fromVersion: '0.1.0',
    toVersion: '0.2.0',
    migrationsDir: FIXTURE_DIR,
    onlyUpToSchema: 2, // restrict to v1-to-v2 for this test
  });

  // scratch is gone; sandbox exists; note.txt followed
  assert.equal(await exists(path.join(target, '_testatlas', 'scratch')), false);
  assert.equal(await exists(path.join(target, '_testatlas', 'sandbox')), true);
  const note = await readFile(path.join(target, '_testatlas', 'sandbox', 'note.txt'), 'utf8');
  assert.equal(note, 'hello');

  const manifest = await loadAndValidateManifest(target);
  assert.equal(manifest.schemaVersion, 2);
});

test('migrate-idempotent: re-running migrations after success is a no-op', async (t) => {
  const target = await makeWorkspaceAtV1();
  t.after(() => rm(target, { recursive: true, force: true }));

  await applyMigrations({
    target,
    fromVersion: '0.1.0',
    toVersion: '0.2.0',
    migrationsDir: FIXTURE_DIR,
    onlyUpToSchema: 2,
  });
  const m1 = await loadAndValidateManifest(target);

  // Run a second time — applyMigrations should observe schemaVersion=2 and
  // skip v1-to-v2 (m.fromSchema < cur).
  await applyMigrations({
    target,
    fromVersion: '0.1.0',
    toVersion: '0.2.0',
    migrationsDir: FIXTURE_DIR,
    onlyUpToSchema: 2,
  });
  const m2 = await loadAndValidateManifest(target);

  assert.equal(m2.schemaVersion, 2);
  // sandbox still exists; nothing duplicated; manifest unchanged structurally.
  assert.equal(await exists(path.join(target, '_testatlas', 'sandbox')), true);
  assert.equal(await exists(path.join(target, '_testatlas', 'scratch')), false);
  // installedAt is fixed at install time and shouldn't change between
  // migration runs.
  assert.equal(m2.installedAt, m1.installedAt);
});
