// Tests for Phase 2 — WORK-07 (content-hash canonicalization contract)
// extended in Phase 11 — Plan 11-03 (ISSUE-013 manifest hash widening).
//
// Covers:
//   - Determinism (same input → same hash)
//   - Output shape — Phase 11: widened to 64 hex chars (was 16; one-line widen
//     in scripts/lib/content-hash.js drops `.slice(0, 16)`)
//   - CRLF normalization (Windows ↔ POSIX equivalence)
//   - Trailing whitespace preservation (markdown hard-break semantics)
//   - Single-character difference detectability
//   - Empty-input stability
//   - Legacy-prefix preservation (algo invariance check — first 16 chars of
//     widened hash MUST equal the pre-Phase-11 16-char output, ensuring no
//     accidental algorithm drift during the slice removal)
//   - verifyHashCompat helper:
//       - 64-char path: full equality
//       - 16-char path: legacy-prefix compare for backward compatibility with
//         pre-Phase-11 manifests (per CONTEXT.md ISSUE-013 LOCKED decision)
//       - rejects malformed lengths (neither 16 nor 64)
//       - tampered content fails both paths

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashContent, verifyHashCompat } from '../scripts/lib/content-hash.js';

// Canonical SHA-256 of the UTF-8 bytes of 'test' (RFC 6234 reference vector).
// Verified locally:
//   node -e "import('node:crypto').then(m => console.log(
//     m.createHash('sha256').update('test').digest('hex')))"
//   → 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
const TEST_FULL = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const TEST_LEGACY = TEST_FULL.slice(0, 16); // '9f86d081884c7d65'

test('WORK-07: deterministic for the same input', () => {
  assert.equal(hashContent(['a', 'b']), hashContent(['a', 'b']));
  assert.equal(hashContent('foo\nbar'), hashContent('foo\nbar'));
});

test('WORK-07 + Phase-11: returns exactly 64 lowercase hex chars (widened from 16)', () => {
  assert.match(hashContent('x'), /^[0-9a-f]{64}$/);
  assert.match(hashContent(['line1', 'line2', 'line3']), /^[0-9a-f]{64}$/);
  assert.match(hashContent(''), /^[0-9a-f]{64}$/);
});

test("Phase-11: hashContent('test') matches the canonical SHA-256 reference vector", () => {
  const h = hashContent('test');
  assert.equal(h.length, 64);
  assert.equal(h, TEST_FULL);
});

test('Phase-11: legacy 16-char prefix preserved (algo unchanged — only the slice was removed)', () => {
  // Guards against accidental algorithm change during the slice-removal edit.
  // The widened hash's first 16 chars MUST equal the pre-Phase-11 output so
  // legacy 16-char manifests still validate via verifyHashCompat.
  assert.ok(
    hashContent('test').startsWith(TEST_LEGACY),
    `widening must not change the algo — first 16 chars of widened hash must equal legacy output ${TEST_LEGACY}`,
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11 — Plan 11-03 — verifyHashCompat coverage (ISSUE-013 legacy-compat).
// ─────────────────────────────────────────────────────────────────────────────

test('Phase-11 verifyHashCompat: legacy 16-char path validates pre-Phase-11 manifests', () => {
  // Pre-Phase-11 manifests stored 16-hex (64-bit) prefix. The compat helper
  // recomputes the full SHA-256 over fresh content and compares the FIRST 16
  // chars to the stored hash. This is the path install-core takes when reading
  // a manifest written by an older suite version.
  assert.equal(verifyHashCompat('test', TEST_LEGACY), true);
});

test('Phase-11 verifyHashCompat: modern 64-char path validates current manifests', () => {
  // Phase-11+ manifests store the full 64-char SHA-256. The compat helper
  // does a full equality compare for these.
  assert.equal(verifyHashCompat('test', TEST_FULL), true);
});

test('Phase-11 verifyHashCompat: tampered content fails legacy 16-char compare', () => {
  // Demonstrates the helper's primary purpose — drift/tamper detection.
  assert.equal(verifyHashCompat('tampered', TEST_LEGACY), false);
});

test('Phase-11 verifyHashCompat: tampered content fails modern 64-char compare', () => {
  assert.equal(verifyHashCompat('tampered', TEST_FULL), false);
});

test('Phase-11 verifyHashCompat: rejects malformed hash lengths (neither 16 nor 64)', () => {
  // Defense against accidentally truncated, padded, or otherwise malformed
  // hashes in a corrupted manifest. We reject conservatively rather than
  // silently truncating-and-comparing.
  assert.equal(verifyHashCompat('test', 'not-a-hash'), false);
  assert.equal(verifyHashCompat('test', ''), false);
  assert.equal(verifyHashCompat('test', '0123456789abcd'), false); // 14 chars
  assert.equal(verifyHashCompat('test', '0123456789abcdef0'), false); // 17 chars
});

test('Phase-11 verifyHashCompat: rejects non-string knownHash', () => {
  // Defense against `undefined` / `null` / numeric values from a corrupt or
  // malformed manifest entry. Returns false rather than throwing — callers
  // decide how to surface manifest corruption.
  assert.equal(verifyHashCompat('test', undefined), false);
  assert.equal(verifyHashCompat('test', null), false);
  assert.equal(verifyHashCompat('test', 12345), false);
});

test('Phase-11 verifyHashCompat: array input + canonical CRLF normalization preserved', () => {
  // Compat helper must respect the same canonicalization contract as
  // hashContent itself. Array form, CRLF input, and single-string form must
  // all hash identically.
  const arr = ['foo', 'bar'];
  const fullArr = hashContent(arr);
  assert.equal(verifyHashCompat(arr, fullArr), true);
  assert.equal(verifyHashCompat(arr, fullArr.slice(0, 16)), true);
  assert.equal(verifyHashCompat('foo\r\nbar', fullArr), true);
  assert.equal(verifyHashCompat('foo\r\nbar', fullArr.slice(0, 16)), true);
});
