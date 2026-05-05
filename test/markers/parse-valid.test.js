// Tests for Phase 2 — WORK-03 (defensive marker parser, valid-input cases).
//
// Asserts the parser:
//   - extracts well-formed sections (single, multiple, empty, with code fence)
//   - returns empty results for marker-free files
//   - tolerates leading/trailing whitespace on marker lines
//   - tolerates kebab-case AND underscore slugs
//   - normalizes CRLF input
//   - assigns a 16-hex hash to each section
//   - excludes marker lines themselves from the section's contentLines

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseMarkers } from '../../scripts/lib/markers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '..', 'fixtures', 'markers');

const loadFixture = (name) => readFile(path.join(fixturesDir, name), 'utf8');

test('WORK-03: parses a single well-formed section', async () => {
  const text = await loadFixture('valid-single-section.md');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 1);
  const section = sections.get('counts');
  assert.ok(section, 'sections must contain "counts"');
  assert.deepEqual(section.contentLines, ['0']);
});

test('WORK-03: parses multiple non-overlapping sections', async () => {
  const text = await loadFixture('valid-multi-section.md');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 2);
  assert.ok(sections.has('alpha'));
  assert.ok(sections.has('beta'));
  assert.deepEqual(sections.get('alpha').contentLines, ['Alpha content']);
  assert.deepEqual(sections.get('beta').contentLines, ['Beta content', 'line two']);
});

test('WORK-03: parses an empty section (zero lines between START and END)', async () => {
  const text = await loadFixture('valid-empty-section.md');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(sections.get('empty').contentLines, []);
});

test('WORK-03: parses a section containing a fenced code block', async () => {
  const text = await loadFixture('valid-with-code-fence.md');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  const section = sections.get('with-fence');
  assert.ok(section);
  assert.ok(
    section.contentLines.some((line) => line.includes('const x = 1;')),
    'fenced code lines must be inside the section content',
  );
});

test('WORK-03: a file with no markers parses cleanly (empty sections, empty errors)', async () => {
  const text = await loadFixture('valid-no-markers.md');
  const { sections, errors } = parseMarkers(text);
  assert.equal(sections.size, 0);
  assert.deepEqual(errors, []);
});

test('WORK-03: tolerates leading whitespace on marker lines', () => {
  const text = [
    '# Title',
    '  <!-- TESTATLAS:GENERATED:START section="x" -->',
    '  body',
    '  <!-- TESTATLAS:GENERATED:END section="x" -->',
  ].join('\n');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 1);
  assert.ok(sections.has('x'));
});

test('WORK-03: tolerates trailing whitespace after the closing -->', () => {
  const text = [
    '<!-- TESTATLAS:GENERATED:START section="x" -->   ',
    'body',
    '<!-- TESTATLAS:GENERATED:END section="x" -->\t  ',
  ].join('\n');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 1);
});

test('WORK-03: accepts kebab-case slugs', () => {
  const text = [
    '<!-- TESTATLAS:GENERATED:START section="alpha-bravo" -->',
    'x',
    '<!-- TESTATLAS:GENERATED:END section="alpha-bravo" -->',
  ].join('\n');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.ok(sections.has('alpha-bravo'));
});

test('WORK-03: accepts underscore slugs (parser is permissive)', () => {
  const text = [
    '<!-- TESTATLAS:GENERATED:START section="alpha_bravo" -->',
    'x',
    '<!-- TESTATLAS:GENERATED:END section="alpha_bravo" -->',
  ].join('\n');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.ok(sections.has('alpha_bravo'));
});

test('WORK-03: normalizes CRLF input (inline string with literal \\r\\n)', () => {
  const text = [
    '# Title',
    '<!-- TESTATLAS:GENERATED:START section="counts" -->',
    '0',
    '<!-- TESTATLAS:GENERATED:END section="counts" -->',
    'tail',
  ].join('\r\n');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 1);
  assert.deepEqual(sections.get('counts').contentLines, ['0']);
});

test('WORK-03: normalizes CRLF input (disk fixture)', async () => {
  const text = await loadFixture('crlf-line-endings.md');
  const { sections, errors } = parseMarkers(text);
  assert.deepEqual(errors, []);
  assert.equal(sections.size, 1);
  assert.ok(sections.has('counts'));
  assert.deepEqual(sections.get('counts').contentLines, ['0']);
});

test('WORK-03 + Phase-11: assigns a 64-hex hash to each parsed section (widened from 16)', async () => {
  const text = await loadFixture('valid-single-section.md');
  const { sections } = parseMarkers(text);
  const hash = sections.get('counts').hash;
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('WORK-03: section content excludes marker lines', async () => {
  const text = await loadFixture('valid-single-section.md');
  const { sections } = parseMarkers(text);
  const lines = sections.get('counts').contentLines;
  for (const line of lines) {
    assert.ok(
      !line.includes('TESTATLAS:GENERATED:'),
      `contentLines must not include marker lines (saw: ${JSON.stringify(line)})`,
    );
  }
});

test('WORK-03: section startLine and endLine point at the marker lines (1-indexed)', async () => {
  const text = await loadFixture('valid-single-section.md');
  const { sections } = parseMarkers(text);
  const section = sections.get('counts');
  const lines = text.split('\n');
  assert.match(lines[section.startLine - 1], /TESTATLAS:GENERATED:START/);
  assert.match(lines[section.endLine - 1], /TESTATLAS:GENERATED:END/);
});
