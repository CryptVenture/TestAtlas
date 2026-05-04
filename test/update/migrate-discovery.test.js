// test/update/migrate-discovery.test.js
//
// Plan 07-03 Task 2 — discoverMigrations: dir scan + parse + sort.

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverMigrations } from '../../scripts/lib/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures', 'migrations-fixture');

test('discoverMigrations: returns sorted descriptors from fixture dir', async () => {
  const out = await discoverMigrations(FIXTURE_DIR);
  assert.equal(out.length, 2);
  assert.equal(out[0].file, 'v1-to-v2.js');
  assert.equal(out[0].fromSchema, 1);
  assert.equal(out[0].toSchema, 2);
  assert.equal(out[1].file, 'v2-to-v3.js');
  assert.equal(out[1].fromSchema, 2);
  assert.equal(out[1].toSchema, 3);
  assert.match(out[0].description, /scratch/i);
  assert.match(out[1].description, /schema-marker/i);
});

test('discoverMigrations: empty migrations dir returns []', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-discover-empty-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = await discoverMigrations(dir);
  assert.deepEqual(out, []);
});

test('discoverMigrations: missing migrations dir returns []', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-discover-missing-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Reference a sub-path that does not exist.
  const out = await discoverMigrations(path.join(dir, 'no-such-dir'));
  assert.deepEqual(out, []);
});

test('discoverMigrations: filters out non-matching filenames (README, dotfiles, *.ts)', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-discover-filter-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'README.md'), '# nope\n');
  await writeFile(path.join(dir, '.gitkeep'), '');
  await writeFile(path.join(dir, 'v1-to-v2.ts'), '');
  await writeFile(path.join(dir, 'helpers.js'), 'export const x = 1;\n');
  await writeFile(
    path.join(dir, 'v1-to-v2.js'),
    'export const fromSchema = 1; export const toSchema = 2; export const description = "x"; export async function up(){}\n',
  );
  const out = await discoverMigrations(dir);
  assert.equal(out.length, 1);
  assert.equal(out[0].file, 'v1-to-v2.js');
});

test('discoverMigrations: sorts by fromSchema even when filenames suggest otherwise', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'testatlas-discover-sort-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Author migrations out-of-order on disk; verify sort by fromSchema.
  await writeFile(
    path.join(dir, 'v3-to-v4.js'),
    'export const fromSchema = 3; export const toSchema = 4; export const description = "c"; export async function up(){}\n',
  );
  await writeFile(
    path.join(dir, 'v1-to-v2.js'),
    'export const fromSchema = 1; export const toSchema = 2; export const description = "a"; export async function up(){}\n',
  );
  await writeFile(
    path.join(dir, 'v2-to-v3.js'),
    'export const fromSchema = 2; export const toSchema = 3; export const description = "b"; export async function up(){}\n',
  );
  const out = await discoverMigrations(dir);
  assert.deepEqual(
    out.map((m) => m.fromSchema),
    [1, 2, 3],
  );
});
