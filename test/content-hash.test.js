// Tests for Phase 2 — WORK-07 (content-hash canonicalization contract).
//
// Covers:
//   - Determinism (same input → same hash)
//   - Output shape (16 hex chars)
//   - CRLF normalization (Windows ↔ POSIX equivalence)
//   - Trailing whitespace preservation (markdown hard-break semantics)
//   - Single-character difference detectability
//   - Empty-input stability

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashContent } from '../scripts/lib/content-hash.js';

test('WORK-07: deterministic for the same input', () => {
  assert.equal(hashContent(['a', 'b']), hashContent(['a', 'b']));
  assert.equal(hashContent('foo\nbar'), hashContent('foo\nbar'));
});

test('WORK-07: returns exactly 16 lowercase hex chars', () => {
  assert.match(hashContent('x'), /^[0-9a-f]{16}$/);
  assert.match(hashContent(['line1', 'line2', 'line3']), /^[0-9a-f]{16}$/);
  assert.match(hashContent(''), /^[0-9a-f]{16}$/);
});

test('WORK-07: CRLF normalizes to LF (Windows ↔ POSIX equivalence)', () => {
  const crlf = 'foo\r\nbar';
  const lf = 'foo\nbar';
  const arr = ['foo', 'bar'];
  assert.equal(hashContent(crlf), hashContent(lf));
  assert.equal(hashContent(crlf), hashContent(arr));
});

test('WORK-07: trailing whitespace is preserved (markdown hard-breaks are meaningful)', () => {
  const withTrailingSpaces = hashContent(['line1   ', 'line2']);
  const withoutTrailingSpaces = hashContent(['line1', 'line2']);
  assert.notEqual(
    withTrailingSpaces,
    withoutTrailingSpaces,
    'trailing whitespace must affect the hash',
  );
});

test('WORK-07: single-character difference produces a different hash', () => {
  assert.notEqual(hashContent('a'), hashContent('b'));
  assert.notEqual(hashContent(['x']), hashContent(['y']));
  assert.notEqual(hashContent('hello'), hashContent('Hello'));
});

test('WORK-07: empty input is stable across array and string forms', () => {
  // Array.join('\n') on [] yields ''. String '' is already canonical.
  assert.equal(hashContent([]), hashContent(''));
});

test('WORK-07: array form and equivalent joined string produce the same hash', () => {
  const arr = ['alpha', 'bravo', 'charlie'];
  const joined = 'alpha\nbravo\ncharlie';
  assert.equal(hashContent(arr), hashContent(joined));
});

test('WORK-07: mixed CRLF/LF in a single string normalizes consistently', () => {
  const mixed = 'a\r\nb\nc\r\nd';
  const allLf = 'a\nb\nc\nd';
  assert.equal(hashContent(mixed), hashContent(allLf));
});
