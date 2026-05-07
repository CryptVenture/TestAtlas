// test/commands/maintain-migrate.test.js
//
// Plan 14-07 Task 2 — maintain-migrate.md documents the V1→V2 upgrade path
// via scripts/v2-migrate.js with backup + rollback instructions.

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(REPO_ROOT, '.testatlas', 'commands', 'maintain', 'maintain-migrate.md');

test('maintain-migrate.md exists with bootstrap-first preamble', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /^---\n/);
  assert.match(text, /^command: maintain-migrate$/m);
  assert.match(text, /Before doing anything else:/);
  assert.match(text, /Read `\.testatlas\/bootstrap\.md`\./);
});

test('maintain-migrate.md references scripts/v2-migrate.js', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /scripts\/v2-migrate\.js/);
});

test('maintain-migrate.md documents V1→V2 upgrade path explicitly', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /V1.{0,5}V2|v1.{0,5}v2/);
});

test('maintain-migrate.md includes backup + rollback instructions', async () => {
  const text = await readFile(FILE, 'utf8');
  assert.match(text, /backup/i, 'must mention backup');
  assert.match(text, /rollback|restore/i, 'must mention rollback or restore');
});

test('maintain-migrate.md word count ≤1800', async () => {
  const text = await readFile(FILE, 'utf8');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1800, `maintain-migrate.md words=${words} > 1800 budget`);
});
