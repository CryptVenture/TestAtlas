// test/dist/dist03-changelog.test.js
//
// Plan 07-05 Task 3 — DIST-03 closure tests.
//
// Asserts CHANGELOG.md has a v0.1.0 entry per Keep-a-Changelog format,
// the entry covers the required sections (Added / Changed / Security),
// includes the "Schema migration" line (DIST-03 contract), and that
// package.json's version matches the most-recent CHANGELOG version.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { skipIfMissing } from '../_helpers/repo-local-state.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REQUIREMENTS_PATH = path.join(REPO_ROOT, '.planning', 'REQUIREMENTS.md');

test('CHANGELOG.md: contains a [0.1.0] heading', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(buf, /## \[0\.1\.0\]/, 'missing ## [0.1.0] heading');
});

test('CHANGELOG.md: [0.1.0] entry has Added / Changed / Security sections', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  // Slice from [0.1.0] to next major heading or EOF.
  const start = buf.indexOf('## [0.1.0]');
  assert.ok(start >= 0, 'missing [0.1.0]');
  const tail = buf.slice(start);
  // Stop at next ## [...] heading if present (there shouldn't be one for older releases yet).
  const nextH = tail.indexOf('\n## [', 1);
  const section = nextH > 0 ? tail.slice(0, nextH) : tail;

  assert.match(section, /### Added/, 'missing Added section');
  assert.match(section, /### Changed/, 'missing Changed section');
  assert.match(section, /### Security/, 'missing Security section');
});

test('CHANGELOG.md: [0.1.0] entry mentions Schema migration (DIST-03 contract)', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  const start = buf.indexOf('## [0.1.0]');
  const tail = buf.slice(start);
  const nextH = tail.indexOf('\n## [', 1);
  const section = nextH > 0 ? tail.slice(0, nextH) : tail;
  // Must contain the "Schema migration" header per DIST-03 contract,
  // even if v0.1.0 declares "None" (baseline schemaVersion: 1).
  assert.match(section, /Schema migration/i, 'missing "Schema migration" section');
});

test('CHANGELOG.md: links to Keep a Changelog format spec', async () => {
  const buf = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(buf, /Keep a Changelog/i, 'missing Keep a Changelog reference');
  assert.match(buf, /Semantic Versioning/i, 'missing Semantic Versioning reference');
});

test('package.json version matches the most-recent CHANGELOG entry', async () => {
  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const changelog = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');

  // Find all "## [x.y.z]" headers (skip [Unreleased]). Most recent is the
  // first one after [Unreleased].
  const versionHeaders = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\]/gm)].map(
    (m) => m[1],
  );

  assert.ok(versionHeaders.length > 0, 'CHANGELOG has no versioned headers');
  const mostRecent = versionHeaders[0];
  assert.equal(
    pkg.version,
    mostRecent,
    `package.json version (${pkg.version}) must match most-recent CHANGELOG entry (${mostRecent})`,
  );
});

test('REQUIREMENTS.md: all 6 INSTALL-0X are flipped to [x]', async (t) => {
  if (!(await skipIfMissing(t, REQUIREMENTS_PATH))) return;
  const buf = await readFile(REQUIREMENTS_PATH, 'utf8');
  const matches = buf.match(/^- \[x\] \*\*INSTALL-0[1-6]\*\*/gm) ?? [];
  assert.equal(matches.length, 6, `expected 6 INSTALL-0X [x] flips, got ${matches.length}`);
});

test('REQUIREMENTS.md: all 7 UPDATE-0X are flipped to [x]', async (t) => {
  if (!(await skipIfMissing(t, REQUIREMENTS_PATH))) return;
  const buf = await readFile(REQUIREMENTS_PATH, 'utf8');
  const matches = buf.match(/^- \[x\] \*\*UPDATE-0[1-7]\*\*/gm) ?? [];
  assert.equal(matches.length, 7, `expected 7 UPDATE-0X [x] flips, got ${matches.length}`);
});

test('REQUIREMENTS.md: all 3 DIST-0X are flipped to [x]', async (t) => {
  if (!(await skipIfMissing(t, REQUIREMENTS_PATH))) return;
  const buf = await readFile(REQUIREMENTS_PATH, 'utf8');
  const matches = buf.match(/^- \[x\] \*\*DIST-0[1-3]\*\*/gm) ?? [];
  assert.equal(matches.length, 3, `expected 3 DIST-0X [x] flips, got ${matches.length}`);
});

test('REQUIREMENTS.md: traceability rows for INSTALL/UPDATE/DIST all say "Complete"', async (t) => {
  if (!(await skipIfMissing(t, REQUIREMENTS_PATH))) return;
  const buf = await readFile(REQUIREMENTS_PATH, 'utf8');
  const ids = [
    ...['INSTALL-01', 'INSTALL-02', 'INSTALL-03', 'INSTALL-04', 'INSTALL-05', 'INSTALL-06'],
    ...['UPDATE-01', 'UPDATE-02', 'UPDATE-03', 'UPDATE-04', 'UPDATE-05', 'UPDATE-06', 'UPDATE-07'],
    ...['DIST-01', 'DIST-02', 'DIST-03'],
  ];
  for (const id of ids) {
    const re = new RegExp(`\\| ${id} \\| Phase 7 \\| Complete \\|`);
    assert.match(buf, re, `missing "${id} | Phase 7 | Complete" traceability row`);
  }
});
