// test/dist/dist01-docs.test.js
//
// Plan 07-05 Task 2 — DIST-01 closure tests.
//
// Verifies that the Phase 7 documentation gallery is present, non-empty, and
// contains the expected anchor headings + keywords. These are deliberately
// content-light: we assert structure, not prose. Prose is a moving target.

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'docs/INSTALL.md',
  'docs/UPDATE.md',
  'docs/UNINSTALL.md',
  'docs/SIGNING.md',
  'docs/LTS.md',
  'docs/RELEASE.md',
];

for (const rel of DOCS) {
  test(`DIST-01: ${rel} exists and is non-empty (>200 bytes)`, async () => {
    const p = path.join(REPO_ROOT, rel);
    const s = await stat(p);
    assert.ok(s.size > 200, `${rel} is too small (${s.size} bytes)`);
  });
}

test('README.md: contains all 3 install paths', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  assert.match(buf, /## Installation/, 'missing ## Installation');
  assert.match(buf, /npx @webventures\/testatlas init/, 'missing npx path');
  assert.match(buf, /install\.sh/, 'missing install.sh path');
  assert.match(buf, /git clone/, 'missing git clone path');
});

test('README.md: links to docs/INSTALL.md, docs/UPDATE.md, docs/UNINSTALL.md, docs/SIGNING.md, docs/LTS.md', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  for (const doc of ['INSTALL', 'UPDATE', 'UNINSTALL', 'SIGNING', 'LTS']) {
    assert.match(buf, new RegExp(`docs/${doc}\\.md`), `missing link to docs/${doc}.md`);
  }
});

test('docs/INSTALL.md: contains "Path 1", "Path 2", "Path 3" structure', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'INSTALL.md'), 'utf8');
  assert.match(buf, /Path 1/, 'missing Path 1');
  assert.match(buf, /Path 2/, 'missing Path 2');
  assert.match(buf, /Path 3/, 'missing Path 3');
});

test('docs/UPDATE.md: covers atomic update + lockfile + migrations + pinning', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'UPDATE.md'), 'utf8');
  assert.match(buf, /atomic/i, 'missing atomic flow mention');
  assert.match(buf, /lockfile/i, 'missing lockfile mention');
  assert.match(buf, /[Mm]igration/, 'missing migration mention');
  assert.match(buf, /pinned[Vv]ersion|pinning/i, 'missing pinning mention');
});

test('docs/UNINSTALL.md: contains behavior matrix + --purge + --force-untracked', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'UNINSTALL.md'), 'utf8');
  assert.match(buf, /[Bb]ehavior matrix/, 'missing behavior matrix');
  assert.match(buf, /--purge/, 'missing --purge flag');
  assert.match(buf, /--force-untracked/, 'missing --force-untracked flag');
  assert.match(buf, /_testatlas\//, 'missing _testatlas/ preservation discussion');
});

test('docs/SIGNING.md: contains cosign verify-blob-attestation + npm audit signatures', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'SIGNING.md'), 'utf8');
  assert.match(buf, /cosign verify-blob-attestation/, 'missing cosign verify-blob-attestation');
  assert.match(buf, /npm audit signatures/, 'missing npm audit signatures');
});

test('docs/LTS.md: contains "current major" and "previous major" support window', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'LTS.md'), 'utf8');
  assert.match(buf, /## Support Window/, 'missing ## Support Window');
  assert.match(buf, /current major/i, 'missing "current major" phrase');
  assert.match(buf, /previous major/i, 'missing "previous major" phrase');
});

test('docs/RELEASE.md: covers Trusted Publisher + dry-run + install.sh sed', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'docs', 'RELEASE.md'), 'utf8');
  assert.match(buf, /Trusted Publisher/i, 'missing Trusted Publisher section');
  assert.match(buf, /dry-run/i, 'missing dry-run discussion');
  assert.match(buf, /install\.sh/, 'missing install.sh sed discussion');
});

test('CONTRIBUTING.md: has Schema/Command-Contract Changes checklist', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CONTRIBUTING.md'), 'utf8');
  assert.match(buf, /Schema or Command-Contract Changes/i, 'missing schema-change section');
  assert.match(buf, /idempotent/i, 'missing idempotency requirement');
});

test('CONTRIBUTING.md: documents LTS strategy', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CONTRIBUTING.md'), 'utf8');
  assert.match(buf, /LTS Strategy/i, 'missing LTS Strategy section');
  assert.match(buf, /docs\/LTS\.md/, 'missing link to docs/LTS.md');
});

test('LICENSE: is MIT', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'LICENSE'), 'utf8');
  assert.match(buf, /MIT License/, 'LICENSE is not MIT');
  assert.match(buf, /Permission is hereby granted/, 'LICENSE missing canonical MIT body');
});
