// Tests for Phase 2 — WORK-03 + TPL-06 (renderSection contract + GFM survival).
//
// Asserts:
//   - renderSection refuses (throws TESTATLAS_MARKER_INVALID) when source has
//     marker errors — no return value, no FS mutation possible.
//   - renderSection throws TESTATLAS_SECTION_NOT_FOUND for an absent slug.
//   - bytes outside the target section are byte-identical (round-trip).
//   - re-parsing the output shows a NEW hash on the target section AND
//     UNCHANGED hashes on the other sections.
//   - HTML comments in markers survive a GFM HTML render (TPL-06).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseMarkers, renderSection } from '../../scripts/lib/markers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '..', 'fixtures');
const markersDir = path.join(fixturesDir, 'markers');
const renderDir = path.join(fixturesDir, 'render');

const loadMarker = (name) => readFile(path.join(markersDir, name), 'utf8');

test('WORK-03: renderSection refuses when source has marker errors', async () => {
  const text = await loadMarker('malformed-nested.md');
  assert.throws(
    () => renderSection(text, 'outer', 'replacement'),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_MARKER_INVALID');
      assert.ok(Array.isArray(err.errors), 'err.errors must be an array');
      assert.ok(err.errors.length > 0);
      return true;
    },
  );
});

test('WORK-03: renderSection throws TESTATLAS_SECTION_NOT_FOUND for an absent slug', async () => {
  const text = await loadMarker('valid-single-section.md');
  assert.throws(
    () => renderSection(text, 'nonexistent', 'whatever'),
    (err) => {
      assert.equal(err.code, 'TESTATLAS_SECTION_NOT_FOUND');
      assert.equal(err.sectionSlug, 'nonexistent');
      return true;
    },
  );
});

test('WORK-03: renderSection preserves bytes outside the target section', async () => {
  const text = await loadMarker('valid-multi-section.md');
  const updated = renderSection(text, 'alpha', 'NEW ALPHA');

  // The beta block + the prose between alpha-END and beta-START must be
  // byte-identical between the original and the updated output.
  const tail = (s) => s.slice(s.indexOf('Some prose.'));
  assert.equal(tail(updated), tail(text), 'content after alpha must be untouched');

  // The alpha START + END marker lines themselves must survive verbatim.
  assert.match(updated, /<!-- TESTATLAS:GENERATED:START section="alpha" -->/);
  assert.match(updated, /<!-- TESTATLAS:GENERATED:END section="alpha" -->/);
  assert.match(updated, /^NEW ALPHA$/m);
});

test('WORK-03: round-trip — parse → render → parse swaps target hash, preserves siblings', async () => {
  const text = await loadMarker('valid-multi-section.md');
  const before = parseMarkers(text);
  const originalAlphaHash = before.sections.get('alpha').hash;
  const originalBetaHash = before.sections.get('beta').hash;

  const updated = renderSection(text, 'alpha', 'totally different content');
  const after = parseMarkers(updated);

  assert.deepEqual(after.errors, [], 'output must re-parse cleanly');
  assert.notEqual(after.sections.get('alpha').hash, originalAlphaHash, 'alpha hash MUST change');
  assert.equal(after.sections.get('beta').hash, originalBetaHash, 'beta hash MUST be unchanged');
});

test('WORK-03: renderSection accepts string OR string-array newContent', async () => {
  const text = await loadMarker('valid-single-section.md');

  const fromString = renderSection(text, 'counts', 'new\nlines');
  const fromArray = renderSection(text, 'counts', ['new', 'lines']);

  assert.equal(fromString, fromArray, 'string and array forms must produce identical output');
});

test('WORK-03: renderSection preserves CRLF line-ending style when source is CRLF', async () => {
  const text = await loadMarker('crlf-line-endings.md');
  const updated = renderSection(text, 'counts', '99');
  // Output should still use CRLF terminators (round-trip safety on Windows).
  assert.ok(updated.includes('\r\n'), 'CRLF line endings must be preserved');
  // And the new content should be present.
  assert.match(updated, /^99$/m);
});

test('TPL-06: HTML comments in markers survive GFM render (fixture sanity check)', async () => {
  const html = await readFile(path.join(renderDir, 'gfm-output.html'), 'utf8');
  assert.match(
    html,
    /<!-- TESTATLAS:GENERATED:START section="alpha" -->/,
    'GFM HTML must preserve START comment verbatim',
  );
  assert.match(
    html,
    /<!-- TESTATLAS:GENERATED:END section="alpha" -->/,
    'GFM HTML must preserve END comment verbatim',
  );
});
