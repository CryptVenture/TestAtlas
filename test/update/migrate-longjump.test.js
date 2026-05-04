// test/update/migrate-longjump.test.js
//
// Plan 07-03 Task 2 — applyMigrations long-jump composition (UPDATE-05).
//
// Verifies:
//   1. v1 → v3 composes both v1-to-v2 and v2-to-v3 in order.
//   2. Starting at v2, only v2-to-v3 runs (v1-to-v2 skipped via fromSchema<cur).
//   3. Gap detection: at v1 with only v3-to-v4 available, runner throws.
//   4. workspace-guard: migration up() does NOT throw two-tree violation
//      when invoked through the runner (explicit 'migration' bypass).

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../scripts/lib/install-core.js';
import { loadAndValidateManifest } from '../../scripts/lib/manifest.js';
import { applyMigrations } from '../../scripts/lib/migrate.js';
import { assertNotUpdate } from '../../scripts/lib/workspace-guard.js';

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

async function freshInstall() {
  const target = await mkdtemp(path.join(tmpdir(), 'testatlas-longjump-'));
  await runInit({ target, suiteRoot: REPO_ROOT, logger: QUIET });
  await mkdir(path.join(target, '_testatlas', 'scratch'), { recursive: true });
  await writeFile(path.join(target, '_testatlas', 'scratch', 'k.txt'), 'v1');
  return target;
}

/**
 * Rewrite an existing manifest's schemaVersion to a different value (test
 * helper). We round-trip through buildManifest to preserve AJV-validity.
 *
 * @param {string} target
 * @param {number} newVersion
 */
async function setManifestSchemaVersion(target, newVersion) {
  const m = await loadAndValidateManifest(target);
  // Re-write directly via writeFile-of-the-validated payload, since we just
  // need to flip one number; manifest.js writeManifest expects payload+files
  // shape (for hashing). Use the parsed JSON path.
  const { writeFile: wf } = await import('node:fs/promises');
  m.schemaVersion = newVersion;
  await wf(
    path.join(target, '.testatlas', '.install-manifest.json'),
    `${JSON.stringify(m, null, 2)}\n`,
    'utf8',
  );
}

test('migrate-longjump: v1 → v3 composes both fixture migrations in order', async (t) => {
  const target = await freshInstall();
  t.after(() => rm(target, { recursive: true, force: true }));

  await applyMigrations({
    target,
    fromVersion: '0.1.0',
    toVersion: '0.3.0',
    migrationsDir: FIXTURE_DIR,
  });

  assert.equal(await exists(path.join(target, '_testatlas', 'sandbox')), true);
  assert.equal(await exists(path.join(target, '_testatlas', 'scratch')), false);
  const marker = await import('node:fs/promises').then((fs) =>
    fs.readFile(path.join(target, '_testatlas', '.schema-marker'), 'utf8'),
  );
  assert.equal(marker, '3');

  const manifest = await loadAndValidateManifest(target);
  assert.equal(manifest.schemaVersion, 3);
});

test('migrate-longjump: starting at v2, only v2-to-v3 runs', async (t) => {
  const target = await freshInstall();
  t.after(() => rm(target, { recursive: true, force: true }));

  // Pre-bump manifest to v2 (and rename scratch→sandbox so the workspace is
  // consistent with v2 — otherwise v2-to-v3 doesn't care, but let's be tidy).
  await setManifestSchemaVersion(target, 2);
  await import('node:fs/promises').then((fs) =>
    fs.rename(
      path.join(target, '_testatlas', 'scratch'),
      path.join(target, '_testatlas', 'sandbox'),
    ),
  );

  await applyMigrations({
    target,
    fromVersion: '0.2.0',
    toVersion: '0.3.0',
    migrationsDir: FIXTURE_DIR,
  });

  // .schema-marker present → v2-to-v3 ran.
  assert.equal(await exists(path.join(target, '_testatlas', '.schema-marker')), true);

  // v1-to-v2 effectively skipped (we wouldn't expect any "scratch→sandbox"
  // double-rename or duplicate — but we don't have an observable). The
  // observable is: schemaVersion=3, .schema-marker=3, no errors.
  const manifest = await loadAndValidateManifest(target);
  assert.equal(manifest.schemaVersion, 3);
});

test('migrate-longjump: gap detection — at v1 with only v3-to-v4 available throws', async (t) => {
  const target = await freshInstall();
  t.after(() => rm(target, { recursive: true, force: true }));

  // Build a gap-only fixture dir: only v3-to-v4 present.
  const gapDir = await mkdtemp(path.join(tmpdir(), 'testatlas-gap-'));
  t.after(() => rm(gapDir, { recursive: true, force: true }));
  await writeFile(
    path.join(gapDir, 'v3-to-v4.js'),
    'export const fromSchema = 3; export const toSchema = 4; export const description = "x"; export async function up(){}\n',
  );

  await assert.rejects(
    () =>
      applyMigrations({
        target,
        fromVersion: '0.1.0',
        toVersion: '0.4.0',
        migrationsDir: gapDir,
      }),
    /Migration gap.*v1.*v3/i,
  );

  // Manifest unchanged after the rejection.
  const manifest = await loadAndValidateManifest(target);
  assert.equal(manifest.schemaVersion, 1);
});

test('migrate-longjump: workspace-guard.assertNotUpdate("migration") does NOT throw', () => {
  // Sanity check that the "migration" caller-context is allowed; the runner
  // sets this context before each up() call.
  assertNotUpdate('migration');
  // 'update' is the forbidden context.
  assert.throws(() => assertNotUpdate('update'), /TWO_TREE_VIOLATION|update/i);
});
