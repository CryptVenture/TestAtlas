// Tests for Phase 2 — WORK-03 (defensive marker parser, malformed inputs).
//
// For each of the 5 active error codes (NESTED_MARKER, ORPHAN_END,
// MISMATCHED_SECTION, MISSING_END, DUPLICATE_SECTION), assert that the
// matching fixture surfaces an errors[] entry with the right code.
//
// Also asserts that the full 7-code ERROR_CODES export is present and frozen
// (ORPHAN_START and MISSING_START are reserved for future enrichment per
// 02-RESEARCH.md §"Pattern 2").

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ERROR_CODES, parseMarkers } from '../../scripts/lib/markers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '..', 'fixtures', 'markers');

const loadFixture = (name) => readFile(path.join(fixturesDir, name), 'utf8');

const hasCode = (errors, code) => errors.some((e) => e.code === code);

test('WORK-03: detects NESTED_MARKER', async () => {
  const text = await loadFixture('malformed-nested.md');
  const { errors } = parseMarkers(text);
  assert.ok(
    hasCode(errors, 'NESTED_MARKER'),
    `expected NESTED_MARKER, got: ${JSON.stringify(errors)}`,
  );
});

test('WORK-03: detects ORPHAN_END', async () => {
  const text = await loadFixture('malformed-orphan-end.md');
  const { errors } = parseMarkers(text);
  assert.ok(hasCode(errors, 'ORPHAN_END'), `expected ORPHAN_END, got: ${JSON.stringify(errors)}`);
});

test('WORK-03: detects MISMATCHED_SECTION', async () => {
  const text = await loadFixture('malformed-mismatched.md');
  const { errors } = parseMarkers(text);
  assert.ok(
    hasCode(errors, 'MISMATCHED_SECTION'),
    `expected MISMATCHED_SECTION, got: ${JSON.stringify(errors)}`,
  );
});

test('WORK-03: detects MISSING_END', async () => {
  const text = await loadFixture('malformed-missing-end.md');
  const { errors } = parseMarkers(text);
  assert.ok(hasCode(errors, 'MISSING_END'), `expected MISSING_END, got: ${JSON.stringify(errors)}`);
});

test('WORK-03: detects DUPLICATE_SECTION', async () => {
  const text = await loadFixture('malformed-duplicate.md');
  const { errors } = parseMarkers(text);
  assert.ok(
    hasCode(errors, 'DUPLICATE_SECTION'),
    `expected DUPLICATE_SECTION, got: ${JSON.stringify(errors)}`,
  );
});

test('WORK-03: NESTED_MARKER + ORPHAN_END combination surfaces both classes', () => {
  // Inline source: nested START, then later an orphan END.
  const text = [
    '<!-- TESTATLAS:GENERATED:START section="outer" -->',
    '<!-- TESTATLAS:GENERATED:START section="inner" -->',
    'body',
    '<!-- TESTATLAS:GENERATED:END section="outer" -->',
    '<!-- TESTATLAS:GENERATED:END section="orphan" -->',
  ].join('\n');
  const { errors } = parseMarkers(text);
  assert.ok(hasCode(errors, 'NESTED_MARKER'));
  assert.ok(hasCode(errors, 'ORPHAN_END'));
});

test('WORK-03: errors carry 1-indexed line numbers', async () => {
  const text = await loadFixture('malformed-orphan-end.md');
  const { errors } = parseMarkers(text);
  const orphan = errors.find((e) => e.code === 'ORPHAN_END');
  assert.ok(orphan);
  assert.equal(typeof orphan.line, 'number');
  assert.ok(orphan.line >= 1, '1-indexed line number');
});

test('WORK-03: ERROR_CODES export contains all 7 canonical codes (frozen)', () => {
  assert.equal(ERROR_CODES.NESTED_MARKER, 'NESTED_MARKER');
  assert.equal(ERROR_CODES.ORPHAN_END, 'ORPHAN_END');
  assert.equal(ERROR_CODES.ORPHAN_START, 'ORPHAN_START');
  assert.equal(ERROR_CODES.MISSING_END, 'MISSING_END');
  assert.equal(ERROR_CODES.MISSING_START, 'MISSING_START');
  assert.equal(ERROR_CODES.MISMATCHED_SECTION, 'MISMATCHED_SECTION');
  assert.equal(ERROR_CODES.DUPLICATE_SECTION, 'DUPLICATE_SECTION');
  assert.ok(Object.isFrozen(ERROR_CODES), 'ERROR_CODES must be frozen');
});
