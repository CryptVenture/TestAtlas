// test/scripts/consolidate-council-comment-code-parity.test.js
//
// Phase 23 / Plan 23-01 / Wave 0 (TDD red-bar) — DEC-007 regression test.
//
// Pins the contract that the docstring comment block above the
// decision-promotion filter in scripts/consolidate-council.js does NOT
// reference "strong-suspect" — the actual filter code at the same site
// promotes only on (status === 'accepted' || confidence === 'confirmed'),
// and the existing pinning test
// `test/scripts/consolidate-council-decisions.test.js` (Test 2) explicitly
// REJECTS strong-suspect promotion.
//
// Today the docstring lists "OR confidence='strong-suspect'" — comment-vs-
// code drift. Wave 1 trims the docstring; this test will then turn GREEN.
//
// Reference: 23-RESEARCH.md lines 330-344 (DEC-007 fix recipe) + 188-196
//            (Pattern 5 — comment-vs-code parity).

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts/consolidate-council.js');
const PINNING_TEST = path.join(ROOT, 'test/scripts/consolidate-council-decisions.test.js');

test('Test 1: docstring above decision-promotion filter contains no orphan "strong-suspect" term', async () => {
  const src = await readFile(SCRIPT, 'utf8');
  const lines = src.split('\n');

  // Locate the DEC-004 comment block by sentinel + extract a generous window
  // around it (≈30 lines) so we are insensitive to small line-number drift.
  const startIdx = lines.findIndex((l) => l.includes('DEC-004 (Phase 22 / COUNCIL-2026-05-09-002'));
  assert.ok(startIdx >= 0, 'expected to find the DEC-004 comment block sentinel');
  const commentBlock = lines.slice(startIdx, startIdx + 30).join('\n');

  assert.doesNotMatch(
    commentBlock,
    /strong-suspect/,
    'docstring still references strong-suspect — comment-vs-code drift',
  );
});

test('Test 2: filter code preserved: (status === accepted || confidence === confirmed)', async () => {
  const src = await readFile(SCRIPT, 'utf8');
  assert.match(src, /c\.status === 'accepted' \|\| c\.confidence === 'confirmed'/);
});

test('Test 3: filter code does NOT include strong-suspect (per pinning Test 2)', async () => {
  const src = await readFile(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /c\.confidence === 'strong-suspect'/);
});

test('Test 4: pinning contract — consolidate-council-decisions Test 2 still rejects strong-suspect', async () => {
  const pinSrc = await readFile(PINNING_TEST, 'utf8');
  assert.match(
    pinSrc,
    /strong-suspect/,
    'pinning test must still reference strong-suspect rejection',
  );
  assert.match(pinSrc, /REJECTED|hypothesized.*REJECTED|rejected/i);
});

test('Test 5: zero occurrences of "strong-suspect" anywhere in scripts/consolidate-council.js', async () => {
  const src = await readFile(SCRIPT, 'utf8');
  const matches = src.match(/strong-suspect/g) || [];
  assert.equal(
    matches.length,
    0,
    `expected 0 occurrences of "strong-suspect" in consolidate-council.js, found ${matches.length}`,
  );
});
