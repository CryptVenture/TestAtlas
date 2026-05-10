// test/scripts/build-sqlite.test.js
//
// Plan 14-08 Task 2 — build-sqlite.js is the optional SQLite brain
// projector. The dependency `better-sqlite3` is intentionally NOT installed
// in the suite repo (PRD §7.20: SQLite is optional, JSON is canonical).
// These tests assert:
//
//   1. Module exports buildSqlite + TABLES constants.
//   2. Calling buildSqlite when the optional dep is missing returns a
//      structured `{ ok: false, reason: 'OPTIONAL_DEPENDENCY_MISSING' }`
//      result (graceful degrade — never throws).
//   3. CLI exits 0 on missing-dep degradation (warning to stderr).
//   4. PRD §7.20 mandates 15 tables.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-sqlite.js');

test('Test 1: build-sqlite degrades gracefully when better-sqlite3 absent', async () => {
  const { buildSqlite } = await import(pathToFileURL(SCRIPT).href);
  const r = await buildSqlite({ cwd: REPO_ROOT, output: '/tmp/should-not-exist.sqlite' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'OPTIONAL_DEPENDENCY_MISSING');
  assert.equal(r.missing, 'better-sqlite3');
  assert.match(r.note, /optional/i);
});

test('Test 2: CLI exits 0 on missing optional dep (warning, not failure)', () => {
  const r = spawnSync(
    'node',
    [SCRIPT, '--rebuild', '--output', '/tmp/testatlas-should-not-exist.sqlite'],
    { encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(r.status, 0, `expected exit 0 (graceful degrade), got ${r.status}: ${r.stderr}`);
  // Warning to stderr (or stdout via console.warn — Node sends warn to stderr).
  const all = `${r.stdout}\n${r.stderr}`;
  assert.match(all, /better-sqlite3/);
  assert.match(all, /optional/i);
});

test('Test 3: PRD §7.20 — 15 tables declared', async () => {
  // We cannot import TABLES because module-default-export pattern; read source instead.
  const src = await import('node:fs/promises').then((fs) => fs.readFile(SCRIPT, 'utf8'));
  const m = src.match(/const TABLES = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(m, 'TABLES constant not found');
  const names = m[1]
    .split(',')
    .map((s) => s.replace(/['"\s]/g, ''))
    .filter((s) => s.length > 0);
  assert.equal(names.length, 15, `expected 15 tables, got ${names.length}: ${names.join(',')}`);
  for (const required of [
    'domains',
    'flows',
    'issues',
    'evidence',
    'personas',
    'council_sessions',
    'transcript_messages',
    'claims',
    'decisions',
    'risks',
    'assumptions',
    'routes',
    'components',
    'endpoints',
    'events',
  ]) {
    assert.ok(names.includes(required), `missing PRD §7.20 table: ${required}`);
  }
});

test('Test 4: docs/static-html-report-spec.md documents the deferred feature', async () => {
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(
    path.join(REPO_ROOT, 'docs', 'static-html-report-spec.md'),
    'utf8',
  );
  assert.match(text, /Static HTML Report/i);
  assert.match(text, /dashboard-data\.json/);
  assert.match(text, /WCAG/i);
  assert.match(text, /(deferred|optional)/i);
});
